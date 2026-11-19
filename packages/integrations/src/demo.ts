import {
  getDb,
  fundingIntents,
  positions,
  settlements,
  orders,
  eq,
  and,
  sql,
  markets,
  contracts,
  inArray,
  pullOpenings,
} from "@collectible/db";
import {
  demoPayout,
  DEMO_GRAIL,
  DEMO_GRAIL_REPLAY,
  demoGrailQuantity,
  explicitResolution,
  quoteDepth,
  asksForSide,
  units,
  money,
  rewardAllocation,
  demoCollectibleValue,
  demoSaleQuote,
  demoPositionContext,
  marketOutcomes,
  DEMO_REPLAY,
  type Market,
  type Book,
  type DemoPosition,
  type DemoCollectible,
  type DemoAccountView,
  type PullOpening,
} from "@collectible/domain";
import { geminiClient } from "./gemini";
import { attachCachedValuations, attachWalletValuations } from "./valuations";

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
export async function lockedDemoAccount(tx: Tx, userId: string) {
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
  const snapshot = await getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
    const [savedPositions, collectibles] = await Promise.all([
      tx
        .select()
        .from(positions)
        .where(
          and(
            eq(positions.userId, userId),
            sql`${positions.idempotencyKey} like 'demo:position:%'`,
          ),
        )
        .orderBy(sql`${positions.createdAt} desc`),
      tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.userId, userId),
            sql`${orders.idempotencyKey} like 'demo:collectible:%'`,
          ),
        )
        .orderBy(sql`${orders.createdAt} desc`),
    ]);
    const view: DemoAccountView = {
      balance: account.amount,
      positions: savedPositions.map((p) => ({
        ...(p.data as Omit<DemoPosition, "id" | "state" | "createdAt">),
        id: p.id,
        state: p.state,
        createdAt: p.createdAt.toISOString(),
      })),
      collectibles: collectibles.map((p) => collectibleView(p)),
    };
    const activeCards = view.collectibles.filter(
      (c) => c.state !== "cancelled",
    );
    const value =
      units(view.balance) +
      view.positions.reduce(
        (sum, p) =>
          sum +
          units(p.grailHolding?.cost ?? "0") +
          (p.state === "open"
            ? units(p.cost)
            : p.reward && p.reward.state !== "claimed"
              ? units(p.reward.budget) -
                activeCards
                  .filter((c) => c.rewardPositionId === p.id)
                  .reduce(
                    (v, c) => v + units(c.cost) - units(c.topUp ?? "0"),
                    0n,
                  )
              : 0n),
        0n,
      ) +
      activeCards.reduce((sum, c) => sum + demoCollectibleValue(c), 0n);
    const previous = account.data as {
      history?: { time: string; value: string }[];
    };
    const history = previous.history ?? [];
    const last = history.at(-1);
    if (
      !last ||
      last.value !== money(value) ||
      Date.now() - Date.parse(last.time) >= 15 * 60000
    ) {
      history.push({ time: new Date().toISOString(), value: money(value) });
      await tx
        .update(fundingIntents)
        .set({ data: { ...previous, history: history.slice(-5000) } })
        .where(eq(fundingIntents.id, account.id));
    }
    return { ...view, history: history.slice(-5000) };
  });
  const missingContext = snapshot.positions.filter(
    (p) => !p.rewardMarket || !p.artwork,
  );
  if (missingContext.length) {
    const stored = await getDb()
      .select({ symbol: contracts.symbol, market: markets.data })
      .from(contracts)
      .innerJoin(markets, eq(markets.id, contracts.marketId))
      .where(
        inArray(
          contracts.symbol,
          missingContext.map((p) => p.symbol),
        ),
      );
    const lookup = new Map(
      stored.map((row) => [row.symbol, row.market as Market]),
    );
    snapshot.positions = snapshot.positions.map((p) => {
      const market = lookup.get(p.symbol),
        contract =
          market && marketOutcomes(market).find((c) => c.symbol === p.symbol);
      const context =
        market && contract ? demoPositionContext(market, contract) : undefined;
      return {
        ...p,
        rewardMarket: p.rewardMarket ?? context?.rewardMarket,
        artwork: p.artwork?.length
          ? p.artwork
          : context?.artwork.length
            ? context.artwork
            : p.replay && p.symbol === DEMO_REPLAY.book.symbol
              ? DEMO_REPLAY.artwork
              : [],
      };
    });
  }
  // Recover a crash between verified delivery and the remainder transaction.
  // Run outside the account lock; only unclaimed, fully delivered baskets qualify.
  let recovered = false;
  for (const position of snapshot.positions.filter(
    (p) => p.reward && p.reward.state !== "claimed",
  )) {
    const cards = snapshot.collectibles.filter(
      (c) => c.rewardPositionId === position.id && c.state !== "cancelled",
    );
    if (cards.length && cards.every((c) => c.state === "confirmed"))
      recovered =
        (await finalizeDemoReward(userId, cards[0]!.id)) === true || recovered;
  }
  if (recovered) return demoAccount(userId);
  const [valued, earlierCards] = await Promise.all([
    attachCachedValuations(
      snapshot.collectibles.flatMap((c) => (c.listing ? [c.listing] : [])),
    ),
    attachWalletValuations(
      snapshot.collectibles
        .filter((c) => !c.listing && c.source === "collectorcrypt")
        .map((c) => ({
          mint: c.sourceId,
          name: c.name,
          imageUrl: c.image,
          interface: "MplCoreAsset",
        })),
      "mainnet",
    ),
  ]);
  const values = new Map(valued.map((c) => [c.mint, c.valuation]));
  const earlierValues = new Map(earlierCards.map((c) => [c.mint, c.valuation]));
  snapshot.collectibles = snapshot.collectibles.map((c) => ({
    ...c,
    valuation: c.listing
      ? (values.get(c.listing.mint) ?? null)
      : (earlierValues.get(c.sourceId) ?? c.valuation),
  }));

  return snapshot;
}
export async function demoTopUp(userId: string, key: string) {
  return getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
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
    rehearsal?: "grail";
    minimumContracts?: string;
    maximumCost?: string;
    rewardMarket?: DemoPosition["rewardMarket"];
    artwork?: DemoPosition["artwork"];
    shareTarget?: DemoPosition["shareTarget"];
  },
  book: Book,
  observedAt = book.updatedAt,
  pullOpeningId?: string,
) {
  if (pullOpeningId && input.replay)
    throw new DemoError("Choose an active market for this pack.", 409);
  const quote = demoBuyQuote(input, book, observedAt);
  return getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
    const [opening] = pullOpeningId
      ? await tx
          .select()
          .from(pullOpenings)
          .where(
            and(
              eq(pullOpenings.id, pullOpeningId),
              eq(pullOpenings.userId, userId),
            ),
          )
          .for("update")
      : [];
    if (pullOpeningId) {
      if (!opening) throw new DemoError("Pack opening not found.", 404);
      if (opening.state === "redeemed") {
        const redemption = (opening.data as Pick<PullOpening, "redemption">)
          .redemption;
        if (
          redemption?.symbol !== book.symbol ||
          redemption.side !== input.side
        )
          throw new DemoError(
            "This pack was already used on another prediction.",
            409,
          );
        return opening.positionId!;
      }
      if (
        opening.state !== "ready" ||
        opening.budget !== money(units(input.stake))
      )
        throw new DemoError("This pack is waiting for a verified result.", 409);
      // Recheck freshness after acquiring the write lock.
      demoBuyQuote(input, book, observedAt);
    }
    const idempotencyKey = `demo:position:${userId}:${key}`;
    const [existing] = await tx
      .select()
      .from(positions)
      .where(eq(positions.idempotencyKey, idempotencyKey));
    if (existing) return existing.id;
    const fillKey = `demo:buy:${userId}:${key}`;
    const [receipt] = await tx
      .select()
      .from(orders)
      .where(eq(orders.idempotencyKey, fillKey));
    if (receipt) return (receipt.data as { positionId: string }).positionId;
    if (!opening && units(account.amount) < units(quote.cost))
      throw new DemoError(
        "Insufficient balance. Add funds in your wallet.",
        409,
      );
    // The account lock serializes buys, sells, settlement and reward claims.
    const open = await tx
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.userId, userId),
          eq(positions.state, "open"),
          sql`${positions.idempotencyKey} like 'demo:position:%'`,
        ),
      )
      .for("update");
    const current = open.find((row) => {
      const p = row.data as DemoPosition;
      return (
        p.symbol === book.symbol &&
        p.side === input.side &&
        p.replay === input.replay &&
        p.rehearsal === input.rehearsal
      );
    });
    const old = current?.data as DemoPosition | undefined;
    const quantity = units(old?.quantity ?? "0") + units(quote.contracts);
    const cost = units(old?.cost ?? "0") + units(quote.cost);
    const data = {
      ...old,
      network: "devnet",
      ...input,
      symbol: book.symbol,
      quantity: money(quantity),
      cost: money(cost),
      averagePrice: money((cost * 1000000n) / quantity),
    };
    const [position] = current
      ? await tx
          .update(positions)
          .set({ data })
          .where(eq(positions.id, current.id))
          .returning()
      : await tx
          .insert(positions)
          .values({ userId, idempotencyKey, state: "open", data })
          .returning();
    await tx.insert(orders).values({
      userId,
      idempotencyKey: fillKey,
      state: "filled",
      data: {
        positionId: position!.id,
        symbol: book.symbol,
        side: input.side,
        quantity: quote.contracts,
        cost: quote.cost,
        network: "devnet",
        ...(opening ? { pullOpeningId: opening.id } : {}),
      },
    });
    if (opening) {
      await tx
        .update(pullOpenings)
        .set({
          state: "redeemed",
          positionId: position!.id,
          data: {
            ...(opening.data as object),
            redemption: {
              eventTicker: input.eventTicker,
              side: input.side,
              symbol: book.symbol,
              cost: quote.cost,
              quantity: quote.contracts,
              remainder: quote.unspent,
            },
          },
        })
        .where(eq(pullOpenings.id, opening.id));
    }
    await tx
      .update(fundingIntents)
      .set({
        amount: money(
          units(account.amount) +
            (opening ? units(quote.unspent) : -units(quote.cost)),
        ),
        version: account.version + 1,
      })
      .where(eq(fundingIntents.id, account.id));
    return position!.id;
  });
}

export function demoBuyQuote(
  input: {
    side: "yes" | "no";
    stake: string;
    replay: boolean;
    rehearsal?: "grail";
    minimumContracts?: string;
    maximumCost?: string;
  },
  book: Book,
  observedAt = book.updatedAt,
) {
  if (
    input.rehearsal &&
    (!input.replay || book.symbol !== DEMO_GRAIL_REPLAY.book.symbol)
  )
    throw new DemoError("Open the Grail rehearsal to use this scenario.");
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
    (input.minimumContracts &&
      units(quote.contracts) < units(input.minimumContracts)) ||
    (input.maximumCost && units(quote.cost) > units(input.maximumCost))
  )
    throw new DemoError(
      "The price changed. Review the updated shares and confirm again.",
      409,
    );
  if (
    units(quote.contracts) <
    units(book.quantityMinimum ?? book.quantityIncrement)
  )
    throw new DemoError(
      "The stake cannot fill the minimum shares at current depth.",
      409,
    );
  return quote;
}
export async function settleDemoPosition(
  userId: string,
  id: string,
  resolution: "yes" | "no" | "void",
  source: "gemini" | "replay",
) {
  return getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
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
      state:
        resolution === "void"
          ? "refunded"
          : resolution === data.side
            ? "reward_ready"
            : "lost",
      data: { network: "devnet", positionId: id, resolution, source, payout },
    });
    if (resolution === "void")
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
          ...(data.replay &&
          data.rehearsal === "grail" &&
          resolution === data.side
            ? {
                grailHolding: {
                  symbol: DEMO_GRAIL.symbol,
                  quantity: demoGrailQuantity(payout),
                  cost: payout,
                  priceUsd: DEMO_GRAIL.priceUsd,
                  purchasedAt: new Date().toISOString(),
                },
              }
            : {}),
          ...(resolution !== "void" && resolution === data.side
            ? {
                reward: {
                  budget: payout,
                  state: data.rehearsal === "grail" ? "claimed" : "available",
                  ...(data.rehearsal === "grail" ? { delivery: "grail" } : {}),
                  cardSpend: "0.000000",
                  remainder: data.rehearsal === "grail" ? "0.000000" : payout,
                },
              }
            : {}),
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

/** Older wins were already credited as cash. Move that value, never mint it twice. */
export async function recoverDemoReward(userId: string, id: string) {
  await getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
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
    const data = position?.data as DemoPosition | undefined;
    if (!position || position.state !== "won" || !data?.payout)
      throw new DemoError("Winning position not found.", 404);
    if (data.reward) return;
    if (units(account.amount) < units(data.payout))
      throw new DemoError(
        "This older win was paid to your balance and has already been spent. New wins go directly to card rewards.",
        409,
      );
    await tx.insert(settlements).values({
      userId,
      idempotencyKey: `demo:recover-reward:${id}`,
      state: "reward_ready",
      data: { positionId: id, amount: data.payout, network: "devnet" },
    });
    await tx
      .update(fundingIntents)
      .set({
        amount: money(units(account.amount) - units(data.payout)),
        version: account.version + 1,
      })
      .where(eq(fundingIntents.id, account.id));
    await tx
      .update(positions)
      .set({
        data: {
          ...data,
          reward: {
            budget: data.payout,
            state: "available",
            cardSpend: "0.000000",
            remainder: data.payout,
          },
        },
      })
      .where(eq(positions.id, id));
  });
}
export function collectibleView(
  row: typeof orders.$inferSelect,
): DemoCollectible {
  const d = row.data as DemoCollectible & { payment?: unknown };
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
    rewardPositionId: d.rewardPositionId,
    topUp: d.topUp,
    paymentConfirmedAt: d.paymentConfirmedAt,
    valuation: d.valuation,
    listing: d.listing,
    confirmedAt: d.confirmedAt,
    ...(row.state === "prepared" &&
    units(d.topUp ?? "0") === 0n &&
    d.payment == null
      ? { unsignedBase64: d.unsignedBase64 }
      : {}),
  };
}
export async function reserveDemoCollectible(
  userId: string,
  key: string,
  collectible: Omit<DemoCollectible, "id" | "state">,
) {
  return getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
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
  await getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
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
    if (data.rewardPositionId) {
      const [position] = await tx
        .select()
        .from(positions)
        .where(
          and(
            eq(positions.id, data.rewardPositionId),
            eq(positions.userId, userId),
          ),
        )
        .for("update");
      const p = position?.data as DemoPosition | undefined;
      if (!position || !p?.reward || p.reward.state === "claimed")
        throw new DemoError("Reward cannot be changed.", 409);
      await tx
        .update(positions)
        .set({
          data: {
            ...p,
            reward: {
              ...p.reward,
              state: "available",
              cardSpend: money(units(p.reward.cardSpend) - units(data.cost)),
              remainder: money(
                units(p.reward.remainder) +
                  units(data.cost) -
                  units(data.topUp ?? "0"),
              ),
              topUp: money(
                units(p.reward.topUp ?? "0") - units(data.topUp ?? "0"),
              ),
            },
          },
        })
        .where(eq(positions.id, position.id));
    } else
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
  await finalizeDemoReward(userId, id);
}

/** Reserve a whole basket against a won position; cash is not spendable twice. */
export async function allocateDemoReward(
  userId: string,
  positionId: string,
  key: string,
  items: Omit<DemoCollectible, "id" | "state">[],
  expectedTopUp = "0",
) {
  return getDb().transaction(async (tx) => {
    await lockedDemoAccount(tx, userId);
    const [position] = await tx
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.id, positionId),
          eq(positions.userId, userId),
          sql`${positions.idempotencyKey} like 'demo:position:%'`,
        ),
      )
      .for("update");
    const data = position?.data as DemoPosition | undefined;
    if (!position || position.state !== "won" || !data?.reward)
      throw new DemoError("Choose a winning reward from your portfolio.", 409);
    const requestKey = `demo:reward:${userId}:${key}`;
    const [existing] = await tx
      .select()
      .from(settlements)
      .where(eq(settlements.idempotencyKey, requestKey));
    if (existing) return;
    if (data.reward.state !== "available")
      throw new DemoError(
        "These rewards are already selected. View your collection.",
        409,
      );
    const saved = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          sql`${orders.data}->>'rewardPositionId' = ${positionId}`,
          sql`${orders.state} <> 'cancelled'`,
        ),
      );
    const seen = new Set(
      saved.map((r) => (r.data as DemoCollectible).sourceId),
    );
    if (!items.length || items.length > 20)
      throw new DemoError("Choose between 1 and 20 cards.");
    for (const item of items) {
      if (seen.has(item.sourceId))
        throw new DemoError("Each card can only be selected once.");
      if (units(item.cost) <= 0n)
        throw new DemoError("Card price unavailable.", 409);
      seen.add(item.sourceId);
    }
    const committedTopUp = saved.reduce(
      (sum, r) => sum + units((r.data as DemoCollectible).topUp ?? "0"),
      0n,
    );
    const allocation = rewardAllocation(
      data.reward.budget,
      [
        ...saved.map((r) => (r.data as DemoCollectible).cost),
        ...items.map((c) => c.cost),
      ],
      money(committedTopUp),
    );
    if (!allocation.valid)
      throw new DemoError(
        allocation.overBudget
          ? "Cards exceed your reward plus the 5% wallet limit."
          : `Choose at least ${allocation.minimum} USDC in cards (80% of your win).`,
        409,
      );
    if (units(allocation.additionalTopUp) !== units(expectedTopUp))
      throw new DemoError(
        "Your wallet contribution changed. Review the exact extra payment and try again.",
        409,
      );
    if (units(allocation.topUp) > 0n)
      throw new DemoError(
        "Paid rewards require a marketplace purchase from your wallet. Demo card claims cannot spend wallet funds.",
        409,
      );
    await tx.insert(settlements).values({
      userId,
      idempotencyKey: requestKey,
      state: "allocated",
      data: { positionId, ...allocation },
    });
    let remainingBudget =
      units(data.reward.budget) -
      saved.reduce((sum, r) => {
        const c = r.data as DemoCollectible;
        return sum + units(c.cost) - units(c.topUp ?? "0");
      }, 0n);
    for (const [index, item] of items.entries()) {
      const cost = units(item.cost),
        contribution = cost < remainingBudget ? cost : remainingBudget;
      const topUp = cost - contribution;
      remainingBudget -= contribution;
      await tx.insert(orders).values({
        userId,
        idempotencyKey: `demo:collectible:${userId}:${key}:${index}`,
        state: "reserved",
        data: {
          ...item,
          topUp: money(topUp),
          paymentConfirmedAt: undefined,
          rewardPositionId: positionId,
          network: "devnet",
        },
      });
    }
    await tx
      .update(positions)
      .set({
        data: {
          ...data,
          reward: {
            budget: data.reward.budget,
            state: "allocated",
            cardSpend: allocation.total,
            remainder: allocation.remainder,
            topUp: allocation.topUp,
          },
        },
      })
      .where(eq(positions.id, positionId));
  });
}

/** Release up to 20% only once every selected card is independently confirmed. */
export async function finalizeDemoReward(userId: string, orderId: string) {
  return getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
    const positionId = (order?.data as DemoCollectible | undefined)
      ?.rewardPositionId;
    if (!positionId) return;
    const [position] = await tx
      .select()
      .from(positions)
      .where(and(eq(positions.id, positionId), eq(positions.userId, userId)))
      .for("update");
    const data = position?.data as DemoPosition | undefined;
    if (!position || !data?.reward || data.reward.state === "claimed") return;
    const cards = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          sql`${orders.data}->>'rewardPositionId' = ${positionId}`,
          sql`${orders.state} <> 'cancelled'`,
        ),
      );
    const allocation = rewardAllocation(
      data.reward.budget,
      cards.map((r) => (r.data as DemoCollectible).cost),
      money(
        cards.reduce(
          (sum, r) => sum + units((r.data as DemoCollectible).topUp ?? "0"),
          0n,
        ),
      ),
    );
    if (
      !cards.length ||
      cards.some((c) => c.state !== "confirmed") ||
      units(allocation.additionalTopUp) > 0n ||
      cards.some((c) => {
        const d = c.data as DemoCollectible;
        return units(d.topUp ?? "0") > 0n && !d.paymentConfirmedAt;
      }) ||
      !allocation.valid
    )
      return;
    await tx.insert(settlements).values({
      userId,
      idempotencyKey: `demo:remainder:${positionId}`,
      state: "credited",
      data: { network: "devnet", positionId, amount: allocation.remainder },
    });
    await tx
      .update(fundingIntents)
      .set({
        amount: money(units(account.amount) + units(allocation.remainder)),
        version: account.version + 1,
      })
      .where(eq(fundingIntents.id, account.id));
    await tx
      .update(positions)
      .set({
        data: {
          ...data,
          reward: {
            ...data.reward,
            state: "claimed",
            cardSpend: allocation.total,
            remainder: allocation.remainder,
            topUp: allocation.topUp,
          },
        },
      })
      .where(eq(positions.id, positionId));
    return true;
  });
}

export async function sellDemoPosition(
  userId: string,
  id: string,
  key: string,
  book: Book,
  minimumProceeds: string,
  observedAt = book.updatedAt,
  quantity?: string,
) {
  return getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
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
    const saleKey = `demo:sell:${userId}:${key}`;
    const [existing] = await tx
      .select()
      .from(settlements)
      .where(eq(settlements.idempotencyKey, saleKey));
    if (existing) {
      if ((existing.data as { positionId: string }).positionId !== id)
        throw new DemoError("This sale key belongs to another position.", 409);
      return;
    }
    if (position.state !== "open")
      throw new DemoError("Only open positions can be sold.", 409);
    if (
      book.symbol !== data.symbol ||
      (!data.replay &&
        (book.source !== "gemini" ||
          book.stale ||
          !Number.isFinite(Date.parse(observedAt)) ||
          Date.now() - Date.parse(observedAt) > 20000 ||
          Date.parse(observedAt) > Date.now() + 5000))
    )
      throw new DemoError("Waiting for fresh bids.", 409);
    const sold = units(quantity ?? data.quantity),
      held = units(data.quantity);
    if (sold <= 0n || sold > held)
      throw new DemoError(
        "Choose shares between zero and your available holding.",
        409,
      );
    const basis = (units(data.cost) * sold) / held;
    const remaining = held - sold;
    const totalSold = units(data.soldQuantity ?? "0") + sold;
    const totalBasis = units(data.realizedCost ?? "0") + basis;
    let proceeds: string;
    try {
      proceeds = demoSaleQuote(
        { ...data, quantity: quantity ?? data.quantity },
        book,
      );
    } catch (e) {
      throw new DemoError((e as Error).message, 409);
    }
    if (units(proceeds) < units(minimumProceeds))
      throw new DemoError(
        "The sale price changed. Review the updated amount.",
        409,
      );
    await tx.insert(settlements).values({
      userId,
      idempotencyKey: saleKey,
      state: "sold",
      data: {
        positionId: id,
        amount: proceeds,
        quantity: money(sold),
        cost: money(basis),
        network: "devnet",
      },
    });
    await tx
      .update(fundingIntents)
      .set({
        amount: money(units(account.amount) + units(proceeds)),
        version: account.version + 1,
      })
      .where(eq(fundingIntents.id, account.id));
    await tx
      .update(positions)
      .set({
        state: remaining > 0n ? "open" : "sold",
        data: {
          ...data,
          quantity: money(remaining > 0n ? remaining : totalSold),
          cost: money(remaining > 0n ? units(data.cost) - basis : totalBasis),
          averagePrice: money(
            ((remaining > 0n ? units(data.cost) - basis : totalBasis) *
              1000000n) /
              (remaining > 0n ? remaining : totalSold),
          ),
          soldQuantity: money(totalSold),
          realizedCost: money(totalBasis),
          soldAt: new Date().toISOString(),
          saleProceeds: money(
            units(data.saleProceeds ?? "0") + units(proceeds),
          ),
        },
      })
      .where(eq(positions.id, id));
  });
}

/** A winning budget is optional: release it to spendable cash exactly once. */
export async function cashDemoReward(userId: string, id: string) {
  return getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
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
    if (data.reward?.delivery === "cash") return;
    if (position.state !== "won" || data.reward?.state !== "available")
      throw new DemoError(
        "Cash is available before selecting a reward. Cancel pending card transfers first.",
        409,
      );
    await tx.insert(settlements).values({
      userId,
      idempotencyKey: `demo:cash:${id}`,
      state: "claimed",
      data: { positionId: id, amount: data.reward.budget, network: "devnet" },
    });
    await tx
      .update(fundingIntents)
      .set({
        amount: money(units(account.amount) + units(data.reward.budget)),
        version: account.version + 1,
      })
      .where(eq(fundingIntents.id, account.id));
    await tx
      .update(positions)
      .set({
        data: {
          ...data,
          reward: {
            ...data.reward,
            state: "claimed",
            delivery: "cash",
            remainder: data.reward.budget,
          },
        },
      })
      .where(eq(positions.id, id));
  });
}
