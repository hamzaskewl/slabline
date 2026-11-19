import { z } from "zod";
import type { Listing, Valuation } from "@collectible/domain";
import {
  getDb,
  fmvValuations,
  valuationJobs,
  comparableSales,
  assets,
  eq,
  and,
  lte,
  sql,
  inArray,
} from "@collectible/db";
import {
  storedListingSchema,
  type WalletCollectible,
} from "@collectible/domain";
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
      price: z.number().positive().finite().nullable().optional(),
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
    comps.cert_info.grader.toLowerCase() !== card.grader.toLowerCase() ||
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
          s.grader.toLowerCase() === card.grader!.toLowerCase() &&
          s.price > 0 &&
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
    // Every card surface can discover inventory outside the background scan.
    // Enqueue identities, never make provider calls in the browser/request path.
    await enqueueValuations(cards);
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
  // Queue all identities once; the worker remains rate-limited. Previously only
  // the first 20 cards could ever receive an estimate.
  const unique = [
    ...new Map(
      cards
        .filter((c) => c.cert && c.grader && c.grade)
        .map((c) => [keyFor(c), c]),
    ).values(),
  ];
  if (!unique.length) return;
  const cached = await getDb()
    .select({ key: fmvValuations.key, expiresAt: fmvValuations.expiresAt })
    .from(fmvValuations)
    .where(inArray(fmvValuations.key, unique.map(keyFor)));
  const fresh = new Set(
    cached.filter((r) => r.expiresAt.getTime() > Date.now()).map((r) => r.key),
  );
  for (let index = 0; index < unique.length; index += 100) {
    const batch = unique
      .slice(index, index + 100)
      .filter((c) => !fresh.has(keyFor(c)));
    if (batch.length)
      await getDb()
        .insert(valuationJobs)
        .values(batch.map((card) => ({ key: keyFor(card), listing: card })))
        .onConflictDoNothing();
  }
}

/** Keep provider-verified identities after a card leaves the listed inventory. */
export async function cacheCardIdentities(cards: Listing[]) {
  if (!process.env.DATABASE_URL || !cards.length) return;
  const unique = [...new Map(cards.map((c) => [c.mint, c])).values()];
  for (let i = 0; i < unique.length; i += 100)
    await getDb()
      .insert(assets)
      .values(
        unique.slice(i, i + 100).map((c) => ({
          mint: c.mint,
          network: c.network,
          provider: c.source,
          data: c,
        })),
      )
      .onConflictDoUpdate({
        target: assets.mint,
        set: { data: sql`excluded.data` },
      });
}
export async function attachWalletValuations(
  items: WalletCollectible[],
  network: "mainnet" | "devnet",
) {
  if (!enabled() || !items.length) return items;
  try {
    const rows = await getDb()
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.network, network),
          eq(assets.provider, "collectorcrypt"),
          inArray(
            assets.mint,
            items.map((c) => c.mint),
          ),
        ),
      );
    const listings = rows.flatMap((r) => {
      const result = storedListingSchema.safeParse(r.data);
      return result.success &&
        result.data.mint === r.mint &&
        result.data.network === network
        ? [result.data]
        : [];
    });
    const values = new Map(
      (await attachCachedValuations(listings)).map((c) => [
        c.mint,
        c.valuation,
      ]),
    );
    return items.map((c) => ({ ...c, valuation: values.get(c.mint) ?? null }));
  } catch {
    return items;
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
