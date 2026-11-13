import { z } from "zod";
import type { Listing, Valuation } from "@collectible/domain";
import {
  getDb,
  fmvValuations,
  valuationJobs,
  comparableSales,
  eq,
  and,
  lte,
  sql,
  inArray,
} from "@collectible/db";
const keyFor = (card: Listing) => `${card.grader}:${card.cert}:${card.grade}`;
const enabled = () =>
  process.env.ENABLE_PUBLIC_FMV === "true" &&
  !!process.env.CARD_HEDGE_API_KEY &&
  !!process.env.DATABASE_URL;
async function cardHedge(path: string, body: unknown) {
  const response = await fetch(`https://api.cardhedger.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.CARD_HEDGE_API_KEY!,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Card Hedge HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}
const certSchema = z.object({
  cert: z.string(),
  grader: z.string(),
  grade: z.string(),
});
const fmvSchema = z.object({
  cert_info: certSchema,
  card: z.object({ card_id: z.string() }).nullable().optional(),
  card_source: z.string().nullable().optional(),
  match_confidence: z.number().nullable().optional(),
  fmv: z
    .object({
      price: z.number().nullable().optional(),
      method: z.string(),
      confidence: z.number().optional(),
      price_explanation: z.string().optional(),
    })
    .nullable()
    .optional(),
});
const compSchema = z.object({
  cert_info: certSchema,
  grade_used: z.string(),
  sales: z
    .array(
      z.object({
        price: z.number(),
        sale_date: z.string().nullable().optional(),
        sale_url: z.string().nullable().optional(),
        grade: z.string(),
        grader: z.string(),
      }),
    )
    .default([]),
});
function numericGrade(label: string) {
  return label.match(/\d+(?:\.\d+)?/)?.[0] ?? label.toUpperCase();
}
export async function fetchCardValuation(
  card: Listing,
): Promise<Valuation | null> {
  if (!enabled() || !card.cert || !card.grader || !card.grade) return null;
  const fmv = fmvSchema.parse(
    await cardHedge("/v1/cards/fmv-by-cert", {
      cert: card.cert,
      grader: card.grader,
    }),
  );
  if (
    fmv.cert_info.cert !== card.cert ||
    fmv.cert_info.grader.toLowerCase() !== card.grader.toLowerCase() ||
    numericGrade(fmv.cert_info.grade) !== numericGrade(card.grade) ||
    !fmv.card ||
    !fmv.fmv?.price ||
    fmv.fmv.method === "no_data"
  )
    return null;
  const comps = compSchema.parse(
    await cardHedge("/v1/cards/comps-by-cert", {
      cert_number: card.cert,
      grading_company: card.grader,
      limit: 5,
      offset: 0,
    }),
  );
  if (
    comps.cert_info.cert !== card.cert ||
    numericGrade(comps.grade_used) !== numericGrade(card.grade)
  )
    return null;
  const now = new Date();
  return {
    providerId: fmv.card.card_id,
    fmv: String(fmv.fmv.price),
    confidence: fmv.card_source === "gemrate_id" ? "exact" : "low",
    methodology: fmv.fmv.price_explanation ?? fmv.fmv.method,
    observedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 18 * 3600000).toISOString(),
    comps: comps.sales
      .filter(
        (s) =>
          s.sale_date &&
          s.sale_url &&
          /^https:\/\//.test(s.sale_url) &&
          Number.isFinite(Date.parse(s.sale_date)) &&
          numericGrade(s.grade) === numericGrade(card.grade!),
      )
      .slice(0, 5)
      .map((s) => ({
        amount: String(s.price),
        soldAt: s.sale_date!,
        url: s.sale_url!,
      })),
  };
}
export async function attachCachedValuations(
  cards: Listing[],
): Promise<Listing[]> {
  if (!enabled() || !cards.length) return cards;
  try {
    const keys = cards.filter((c) => c.cert).map(keyFor);
    if (!keys.length) return cards;
    const rows = await getDb()
      .select()
      .from(fmvValuations)
      .where(inArray(fmvValuations.key, keys));
    const lookup = new Map(
      rows
        .filter((r) => r.expiresAt.getTime() > Date.now())
        .map((r) => [r.key, r.data as Valuation]),
    );
    return cards.map((c) => ({
      ...c,
      valuation: lookup.get(keyFor(c)) ?? null,
    }));
  } catch {
    return cards;
  }
}
export async function enqueueValuations(cards: Listing[]) {
  if (!enabled()) return;
  for (const card of cards.filter((c) => c.cert).slice(0, 20)) {
    const key = keyFor(card);
    const [cached] = await getDb()
      .select()
      .from(fmvValuations)
      .where(eq(fmvValuations.key, key))
      .limit(1);
    if (cached && cached.expiresAt.getTime() > Date.now()) continue;
    await getDb()
      .insert(valuationJobs)
      .values({ key, listing: card })
      .onConflictDoNothing();
  }
}
export async function processValuationJob() {
  if (!enabled()) return;
  const db = getDb();
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(valuationJobs)
      .where(
        and(
          eq(valuationJobs.state, "pending"),
          lte(valuationJobs.nextAttemptAt, new Date()),
        ),
      )
      .limit(1)
      .for("update", { skipLocked: true });
    const row = rows[0];
    if (row)
      await tx
        .update(valuationJobs)
        .set({
          state: "working",
          attempts: row.attempts + 1,
          nextAttemptAt: new Date(Date.now() + 120000),
        })
        .where(eq(valuationJobs.key, row.key));
    return row;
  });
  if (!claimed) return;
  try {
    const valuation = await fetchCardValuation(claimed.listing as Listing);
    if (valuation)
      await db.transaction(async (tx) => {
        await tx
          .insert(fmvValuations)
          .values({
            key: claimed.key,
            providerId: valuation.providerId,
            data: valuation,
            expiresAt: new Date(valuation.expiresAt),
          })
          .onConflictDoUpdate({
            target: fmvValuations.key,
            set: { data: valuation, expiresAt: new Date(valuation.expiresAt) },
          });
        await tx
          .delete(comparableSales)
          .where(eq(comparableSales.valuationKey, claimed.key));
        if (valuation.comps.length)
          await tx.insert(comparableSales).values(
            valuation.comps.map((c) => ({
              valuationKey: claimed.key,
              amount: c.amount,
              soldAt: new Date(c.soldAt),
              url: c.url,
            })),
          );
      });
    await db
      .update(valuationJobs)
      .set({
        state: "pending",
        nextAttemptAt: new Date(Date.now() + 18 * 3600000),
        attempts: 0,
      })
      .where(eq(valuationJobs.key, claimed.key));
  } catch {
    await db
      .update(valuationJobs)
      .set({
        state: claimed.attempts >= 4 ? "failed" : "pending",
        nextAttemptAt: new Date(
          Date.now() + Math.min(3600000, 60000 * 2 ** claimed.attempts),
        ),
      })
      .where(eq(valuationJobs.key, claimed.key));
  }
}
export async function recoverValuationJobs() {
  if (!enabled()) return;
  await getDb()
    .update(valuationJobs)
    .set({ state: "pending" })
    .where(
      and(
        eq(valuationJobs.state, "working"),
        lte(valuationJobs.nextAttemptAt, new Date()),
      ),
    );
}
