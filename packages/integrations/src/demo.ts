import {
  getDb,
  fundingIntents,
  positions,
  settlements,
  orders,
  eq,
  and,
  sql,
} from "@collectible/db";
import {
  demoPayout,
  explicitResolution,
  quoteDepth,
  asksForSide,
  units,
  money,
  type Book,
  type DemoPosition,
  type DemoCollectible,
  type DemoAccountView,
} from "@collectible/domain";
import { geminiClient } from "./gemini";

export class DemoError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireDemoNetwork(network: string | null) {
  if (network !== "devnet")
    throw new DemoError("Choose Devnet in Settings to use this balance.", 409);
}
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
const accountKey = (userId: string) => `demo:account:${userId}`;
async function lockedAccount(tx: Tx, userId: string) {
  await tx
    .insert(fundingIntents)
    .values({
      userId,
      idempotencyKey: accountKey(userId),
      state: "devnet",
      amount: "100.000000",
      data: { network: "devnet", currency: "Demo USD" },
    })
    .onConflictDoNothing();
  const [account] = await tx
    .select()
    .from(fundingIntents)
    .where(
      and(
        eq(fundingIntents.userId, userId),
        eq(fundingIntents.idempotencyKey, accountKey(userId)),
      ),
    )
    .for("update");
  if (!account) throw new DemoError("Balance unavailable.", 503);
  return account;
}
export async function demoAccount(userId: string): Promise<DemoAccountView> {
  const balance = await getDb().transaction(
    async (tx) => (await lockedAccount(tx, userId)).amount,
  );
  const [savedPositions, collectibles] = await Promise.all([
    getDb()
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.userId, userId),
          sql`${positions.idempotencyKey} like 'demo:position:%'`,
        ),
      )
      .orderBy(sql`${positions.createdAt} desc`)
      .limit(200),
    getDb()
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          sql`${orders.idempotencyKey} like 'demo:collectible:%'`,
        ),
      )
      .orderBy(sql`${orders.createdAt} desc`)
      .limit(100),
  ]);
  return {
    balance,
    positions: savedPositions.map((p) => ({
      ...(p.data as Omit<DemoPosition, "id" | "state" | "createdAt">),
      id: p.id,
      state: p.state,
      createdAt: p.createdAt.toISOString(),
    })),
    collectibles: collectibles.map((p) => collectibleView(p)),
  };
}
export async function demoTopUp(userId: string, key: string) {
  return getDb().transaction(async (tx) => {
    const account = await lockedAccount(tx, userId);
    const [entry] = await tx
      .insert(settlements)
      .values({
        userId,
        idempotencyKey: `demo:topup:${userId}:${key}`,
        state: "credited",
        data: { network: "devnet", amount: "100.000000" },
      })
      .onConflictDoNothing()
      .returning();
    if (entry)
      await tx
        .update(fundingIntents)
        .set({
          amount: money(units(account.amount) + units("100")),
          version: account.version + 1,
        })
        .where(eq(fundingIntents.id, account.id));
  });
}
export async function demoBuy(
  userId: string,
  key: string,
  input: {
    eventTicker: string;
    eventTitle: string;
    label: string;
    side: "yes" | "no";
    stake: string;
    replay: boolean;
  },
  book: Book,
  observedAt = book.updatedAt,
) {
  if (units(input.stake) <= 0n || units(input.stake) > units("1000000"))
    throw new DemoError("Enter a stake between 0 and 1,000,000.");
  if (
    !input.replay &&
    (book.source !== "gemini" ||
      book.stale ||
      Date.now() - Date.parse(observedAt) > 20000 ||
      Date.parse(observedAt) - Date.now() > 5000 ||
      !Number.isFinite(Date.parse(observedAt)))
  )
    throw new DemoError("Waiting for fresh market depth.", 409);
  const quote = quoteDepth({
    ...book,
    asks: asksForSide(book, input.side),
    stake: input.stake,
    feeBps: 0,
  });
  if (
    units(quote.contracts) <
    units(book.quantityMinimum ?? book.quantityIncrement)
  )
    throw new DemoError(
      "The stake cannot fill the minimum shares at current depth.",
      409,
    );
  return getDb().transaction(async (tx) => {
    const account = await lockedAccount(tx, userId);
    const idempotencyKey = `demo:position:${userId}:${key}`;
    const [existing] = await tx
      .select()
      .from(positions)
      .where(eq(positions.idempotencyKey, idempotencyKey));
    if (existing) return existing.id;
    if (units(account.amount) < units(quote.cost))
      throw new DemoError(
        "Insufficient balance. Add funds in your wallet.",
        409,
      );
    const [position] = await tx
      .insert(positions)
      .values({
        userId,
        idempotencyKey,
        state: "open",
        data: {
          network: "devnet",
          ...input,
          symbol: book.symbol,
          quantity: quote.contracts,
          cost: quote.cost,
          averagePrice: quote.averagePrice,
        },
      })
      .returning();
    await tx
      .update(fundingIntents)
      .set({
        amount: money(units(account.amount) - units(quote.cost)),
        version: account.version + 1,
      })
      .where(eq(fundingIntents.id, account.id));
    return position!.id;
  });
}
export async function settleDemoPosition(
  userId: string,
  id: string,
  resolution: "yes" | "no" | "void",
  source: "gemini" | "replay",
) {
  return getDb().transaction(async (tx) => {
    const account = await lockedAccount(tx, userId);
    const [position] = await tx
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.id, id),
          eq(positions.userId, userId),
          sql`${positions.idempotencyKey} like 'demo:position:%'`,
        ),
      )
      .for("update");
    if (!position) throw new DemoError("Position not found.", 404);
    const data = position.data as DemoPosition;
    if ((source === "replay") !== data.replay)
      throw new DemoError(
        "This position requires its recorded settlement source.",
        409,
      );
    if (position.state !== "open") return;
    const payout = demoPayout(data, resolution);
    await tx.insert(settlements).values({
      userId,
      idempotencyKey: `demo:settlement:${id}`,
      state: "credited",
      data: { network: "devnet", positionId: id, resolution, source, payout },
    });
    await tx
      .update(fundingIntents)
      .set({
        amount: money(units(account.amount) + units(payout)),
        version: account.version + 1,
      })
      .where(eq(fundingIntents.id, account.id));
    await tx
      .update(positions)
      .set({
        state:
          resolution === "void"
            ? "refunded"
            : resolution === data.side
              ? "won"
              : "lost",
        data: {
          ...data,
          resolution,
          payout,
          settledAt: new Date().toISOString(),
          settlementSource: source,
        },
      })
      .where(eq(positions.id, id));
  });
}
export async function reconcileDemoPositions(userId?: string) {
  const rows = await getDb()
    .select()
    .from(positions)
    .where(
      and(
        eq(positions.state, "open"),
        sql`${positions.idempotencyKey} like 'demo:position:%'`,
        sql`${positions.data}->>'replay' = 'false'`,
        ...(userId ? [eq(positions.userId, userId)] : []),
      ),
    )
    .orderBy(sql`coalesce(${positions.data}->>'resolutionCheckedAt','') asc`)
    .limit(200);
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const d = row.data as DemoPosition;
    if (d.replay) continue;
    grouped.set(d.eventTicker, [...(grouped.get(d.eventTicker) ?? []), row]);
  }
  for (const [ticker, group] of [...grouped].slice(0, 20)) {
    try {
      const raw = await (
        await geminiClient()
      ).predictions.getEvent({ eventTicker: ticker });
      for (const row of group) {
        const result = explicitResolution(
          raw,
          (row.data as DemoPosition).symbol,
        );
        if (result)
          await settleDemoPosition(row.userId, row.id, result, "gemini");
      }
    } catch {
      console.warn("Demo resolution read unavailable", ticker);
    } finally {
      // Rotate unresolved events through the bounded batch instead of letting
      // long-running events permanently hide newer positions.
      for (const row of group)
        await getDb()
          .update(positions)
          .set({
            data: sql`jsonb_set(${positions.data}, '{resolutionCheckedAt}', to_jsonb(${new Date().toISOString()}::text))`,
          })
          .where(and(eq(positions.id, row.id), eq(positions.state, "open")));
    }
  }
}
export function collectibleView(
  row: typeof orders.$inferSelect,
): DemoCollectible {
  const d = row.data as DemoCollectible;
  return {
    id: row.id,
    state: row.state,
    name: d.name,
    image: d.image,
    source: d.source,
    sourceId: d.sourceId,
    sourceUrl: d.sourceUrl,
    cost: d.cost,
    wallet: d.wallet,
    mint: d.mint,
    signature: d.signature,
    ...(row.state === "prepared" ? { unsignedBase64: d.unsignedBase64 } : {}),
  };
}
export async function reserveDemoCollectible(
  userId: string,
  key: string,
  collectible: Omit<DemoCollectible, "id" | "state">,
) {
  return getDb().transaction(async (tx) => {
    const account = await lockedAccount(tx, userId);
    const idempotencyKey = `demo:collectible:${userId}:${key}`;
    const [existing] = await tx
      .select()
      .from(orders)
      .where(eq(orders.idempotencyKey, idempotencyKey));
    if (existing) return existing;
    const [pending] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          sql`${orders.idempotencyKey} like 'demo:collectible:%'`,
          sql`${orders.state} in ('reserved','prepared','submitted','failed')`,
          sql`${orders.data}->>'sourceId' = ${collectible.sourceId}`,
          sql`${orders.data}->>'wallet' = ${collectible.wallet}`,
        ),
      )
      .limit(1);
    if (pending) return pending;
    if (
      units(collectible.cost) <= 0n ||
      units(account.amount) < units(collectible.cost)
    )
      throw new DemoError("Insufficient balance for this card.", 409);
    const [row] = await tx
      .insert(orders)
      .values({
        userId,
        idempotencyKey,
        state: "reserved",
        data: { ...collectible, network: "devnet" },
      })
      .returning();
    await tx
      .update(fundingIntents)
      .set({
        amount: money(units(account.amount) - units(collectible.cost)),
        version: account.version + 1,
      })
      .where(eq(fundingIntents.id, account.id));
    return row!;
  });
}
export async function cancelDemoCollectible(userId: string, id: string) {
  return getDb().transaction(async (tx) => {
    const account = await lockedAccount(tx, userId);
    const [row] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, id),
          eq(orders.userId, userId),
          sql`${orders.idempotencyKey} like 'demo:collectible:%'`,
        ),
      )
      .for("update");
    if (!row) throw new DemoError("Card not found.", 404);
    if (!["reserved", "expired"].includes(row.state))
      throw new DemoError(
        "Check the submitted transaction before cancelling.",
        409,
      );
    const data = row.data as DemoCollectible;
    await tx
      .update(fundingIntents)
      .set({
        amount: money(units(account.amount) + units(data.cost)),
        version: account.version + 1,
      })
      .where(eq(fundingIntents.id, account.id));
    await tx
      .update(orders)
      .set({ state: "cancelled" })
      .where(eq(orders.id, id));
  });
}
