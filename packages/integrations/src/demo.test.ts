import { expect, test } from "bun:test";
import {
  withSolanaNetwork,
  solanaNetwork,
  solanaUsdcMint,
  SOLANA_USDC_MINTS,
} from "./solana";

test("network selection is isolated per asynchronous request", async () => {
  const original = solanaNetwork();
  const result = await Promise.all(
    (["mainnet", "devnet"] as const).map((n) =>
      withSolanaNetwork(n, async () => {
        await Promise.resolve();
        return { network: solanaNetwork(), mint: solanaUsdcMint() };
      }),
    ),
  );
  expect(result).toEqual([
    { network: "mainnet", mint: SOLANA_USDC_MINTS.mainnet },
    { network: "devnet", mint: SOLANA_USDC_MINTS.devnet },
  ]);
  expect(solanaNetwork()).toBe(original);
});
import {
  demoPayout,
  explicitResolution,
  DEMO_REPLAY,
} from "@collectible/domain";
import {
  demoAccount,
  demoTopUp,
  demoBuy,
  settleDemoPosition,
  reserveDemoCollectible,
  cancelDemoCollectible,
  requireDemoNetwork,
  allocateDemoReward,
  finalizeDemoReward,
  sellDemoPosition,
  recoverDemoReward,
} from "./demo";
import {
  buildDemoMint,
  inspectDemoMintSignature,
  checkDemoMint,
} from "./demo-nft";
import {
  getDb,
  users,
  fundingIntents,
  positions,
  settlements,
  orders,
  eq,
} from "@collectible/db";
import {
  generateKeyPairSigner,
  getTransactionDecoder,
  partiallySignTransaction,
  getBase64EncodedWireTransaction,
} from "@solana/kit";

test("demo settlement uses explicit results, including nested contracts and void refunds", () => {
  const p = { side: "yes" as const, cost: "20", quantity: "50" };
  expect(demoPayout(p, "yes")).toBe("50.000000");
  expect(demoPayout(p, "no")).toBe("0.000000");
  expect(demoPayout(p, "void")).toBe("20");
  const c = {
    instrumentSymbol: "GEMI-TEST",
    status: "closed",
    prices: { lastTradePrice: "1" },
    resolutionSide: "yes",
    resolvedAt: new Date().toISOString(),
  };
  expect(explicitResolution({ contracts: [c] }, "GEMI-TEST")).toBeNull();
  expect(
    explicitResolution(
      { events: [{ contracts: [{ ...c, status: "settled" }] }] },
      "GEMI-TEST",
    ),
  ).toBe("yes");
  expect(
    explicitResolution(
      { contracts: [{ ...c, status: "settled", resolvedAt: null }] },
      "GEMI-TEST",
    ),
  ).toBeNull();
  expect(
    explicitResolution(
      { contracts: [{ ...c, status: "invalid" }] },
      "GEMI-TEST",
    ),
  ).toBe("void");
  expect(() => requireDemoNetwork("mainnet")).toThrow();
});

test("devnet Core mint preserves the reviewed message and requires both asset and wallet signatures", async () => {
  const wallet = await generateKeyPairSigner();
  const built = await buildDemoMint(
    wallet.address,
    "Collectible Markets card",
    "https://example.com/card.json",
    {
      blockhash: "11111111111111111111111111111111",
      lastValidBlockHeight: 1000n,
    },
  );
  const draft = getTransactionDecoder().decode(
    Buffer.from(built.unsignedBase64, "base64"),
  );
  expect(() =>
    inspectDemoMintSignature(
      built.unsignedBase64,
      built.unsignedBase64,
      wallet.address,
    ),
  ).toThrow();
  const signed = await partiallySignTransaction([wallet.keyPair], draft);
  const wire = getBase64EncodedWireTransaction(signed);
  expect(
    inspectDemoMintSignature(built.unsignedBase64, wire, wallet.address),
  ).toBeTruthy();
  const other = await buildDemoMint(
    wallet.address,
    "Changed card",
    "https://example.com/card.json",
    {
      blockhash: "11111111111111111111111111111111",
      lastValidBlockHeight: 1000n,
    },
  );
  expect(() =>
    inspectDemoMintSignature(other.unsignedBase64, wire, wallet.address),
  ).toThrow("changed");
});

async function rejects(action: Promise<unknown>, message: string) {
  let error: unknown;
  try {
    await action;
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain(message);
}

test.skipIf(!process.env.DATABASE_URL)(
  "demo balance, orders, settlement and card reservations survive duplicate/concurrent requests and isolate users",
  async () => {
    const db = getDb();
    const rows = await db
      .insert(users)
      .values([
        { privyId: `demo-test-${crypto.randomUUID()}` },
        { privyId: `demo-test-${crypto.randomUUID()}` },
      ])
      .returning();
    const a = rows[0]!.id,
      b = rows[1]!.id;
    try {
      expect(
        (await Promise.all([demoAccount(a), demoAccount(a)])).map(
          (v) => v.balance,
        ),
      ).toEqual(["100.000000", "100.000000"]);
      const key = crypto.randomUUID();
      await Promise.all([demoTopUp(a, key), demoTopUp(a, key)]);
      expect((await demoAccount(a)).balance).toBe("200.000000");
      const buyKey = crypto.randomUUID();
      const input = {
        eventTicker: "TEST",
        eventTitle: "Test",
        label: "San Antonio",
        side: "yes" as const,
        stake: "40",
        replay: true,
      };
      const ids = await Promise.all([
        demoBuy(a, buyKey, input, DEMO_REPLAY.book),
        demoBuy(a, buyKey, input, DEMO_REPLAY.book),
      ]);
      expect(ids[0]).toBe(ids[1]);
      expect((await demoAccount(a)).positions).toHaveLength(1);
      await rejects(
        settleDemoPosition(b, ids[0]!, "yes", "replay"),
        "not found",
      );
      await rejects(settleDemoPosition(a, ids[0]!, "yes", "gemini"), "source");
      const before = await demoAccount(a),
        p = before.positions[0]!;
      await Promise.all([
        settleDemoPosition(a, p.id, "yes", "replay"),
        settleDemoPosition(a, p.id, "yes", "replay"),
      ]);
      const after = await demoAccount(a);
      expect(after.balance).toBe(before.balance);
      expect(after.positions[0]!.reward?.budget).toBe(p.quantity);
      expect(after.positions[0]!.reward?.state).toBe("available");
      expect(after.positions[0]!.state).toBe("won");
      expect((await demoAccount(b)).balance).toBe("100.000000");
      const overspend = await Promise.allSettled([
        demoBuy(
          b,
          crypto.randomUUID(),
          { ...input, stake: "80" },
          DEMO_REPLAY.book,
        ),
        demoBuy(
          b,
          crypto.randomUUID(),
          { ...input, stake: "80" },
          DEMO_REPLAY.book,
        ),
      ]);
      expect(overspend.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const cardKey = crypto.randomUUID(),
        item = {
          name: "Test card",
          image: null,
          source: "collectorcrypt" as const,
          sourceId: "test",
          sourceUrl: "https://collectorcrypt.com",
          cost: "10",
          wallet: "test-wallet",
        };
      const reserved = await Promise.all([
        reserveDemoCollectible(a, cardKey, item),
        reserveDemoCollectible(a, cardKey, item),
      ]);
      expect(reserved[0]!.id).toBe(reserved[1]!.id);
      expect(
        (await reserveDemoCollectible(a, crypto.randomUUID(), item)).id,
      ).toBe(reserved[0]!.id);
      expect(Number((await demoAccount(a)).balance)).toBeCloseTo(
        Number(after.balance) - 10,
        6,
      );
      await cancelDemoCollectible(a, reserved[0]!.id);
      const repeatedRefund = await Promise.allSettled([
        cancelDemoCollectible(a, reserved[0]!.id),
      ]);
      expect(repeatedRefund[0]!.status).toBe("rejected");
      expect((await demoAccount(a)).balance).toBe(after.balance);

      const rewardKey = crypto.randomUUID();
      const budget = Number(p.quantity);
      const card = {
        ...item,
        sourceId: "reward-1",
        cost: (budget * 0.8).toFixed(6),
      };
      await rejects(
        allocateDemoReward(b, p.id, rewardKey, [card]),
        "winning reward",
      );
      await rejects(
        allocateDemoReward(a, p.id, rewardKey, [
          { ...card, cost: (budget * 0.79).toFixed(6) },
        ]),
        "80%",
      );
      await rejects(
        allocateDemoReward(a, p.id, rewardKey, [
          { ...card, cost: String(budget + 1) },
        ]),
        "exceed",
      );
      await rejects(
        allocateDemoReward(a, p.id, rewardKey, [card, card]),
        "once",
      );
      await Promise.all([
        allocateDemoReward(a, p.id, rewardKey, [card]),
        allocateDemoReward(a, p.id, rewardKey, [card]),
      ]);
      const allocated = await demoAccount(a);
      const rewardCards = allocated.collectibles.filter(
        (c) => c.rewardPositionId === p.id,
      );
      expect(rewardCards).toHaveLength(1);
      expect(allocated.balance).toBe(after.balance);
      await finalizeDemoReward(a, rewardCards[0]!.id);
      expect((await demoAccount(a)).balance).toBe(after.balance);
      await cancelDemoCollectible(a, rewardCards[0]!.id);
      expect((await demoAccount(a)).balance).toBe(after.balance);
      expect((await demoAccount(a)).positions[0]!.reward?.state).toBe(
        "available",
      );
      await allocateDemoReward(a, p.id, crypto.randomUUID(), [
        { ...card, sourceId: "reward-2" },
      ]);
      const second = (await demoAccount(a)).collectibles.find(
        (c) => c.sourceId === "reward-2",
      )!;
      await db
        .update(orders)
        .set({ state: "confirmed" })
        .where(eq(orders.id, second.id));
      await Promise.all([checkDemoMint(a, second.id), demoAccount(a)]);
      expect(Number((await demoAccount(a)).balance)).toBeCloseTo(
        Number(after.balance) + budget * 0.2,
        6,
      );
      expect((await demoAccount(a)).positions[0]!.reward?.state).toBe(
        "claimed",
      );
      const saleId = await demoBuy(
        a,
        crypto.randomUUID(),
        { ...input, stake: "10" },
        DEMO_REPLAY.book,
      );
      const saleBefore = await demoAccount(a);
      await rejects(
        sellDemoPosition(b, saleId, crypto.randomUUID(), DEMO_REPLAY.book, "0"),
        "not found",
      );
      await rejects(
        sellDemoPosition(
          a,
          saleId,
          crypto.randomUUID(),
          DEMO_REPLAY.book,
          "10000",
        ),
        "price changed",
      );
      const saleKey = crypto.randomUUID();
      await Promise.all([
        sellDemoPosition(a, saleId, saleKey, DEMO_REPLAY.book, "0"),
        sellDemoPosition(a, saleId, saleKey, DEMO_REPLAY.book, "0"),
      ]);
      const sold = (await demoAccount(a)).positions.find(
        (r) => r.id === saleId,
      )!;
      expect(sold.state).toBe("sold");
      expect(Number((await demoAccount(a)).balance)).toBeCloseTo(
        Number(saleBefore.balance) + Number(sold.saleProceeds),
        6,
      );
      // Reconstruct a pre-reward-policy win: its payout already sits in cash.
      const legacyId = await demoBuy(
        a,
        crypto.randomUUID(),
        { ...input, stake: "10" },
        DEMO_REPLAY.book,
      );
      await settleDemoPosition(a, legacyId, "yes", "replay");
      const legacyAccount = await demoAccount(a);
      const legacy = legacyAccount.positions.find((p) => p.id === legacyId)!;
      const { reward: _reward, ...legacyData } = legacy;
      await db
        .update(positions)
        .set({ data: legacyData })
        .where(eq(positions.id, legacyId));
      const [balanceRow] = await db
        .select()
        .from(fundingIntents)
        .where(eq(fundingIntents.userId, a));
      await db
        .update(fundingIntents)
        .set({
          amount: (
            Number(legacyAccount.balance) + Number(legacy.payout)
          ).toFixed(6),
        })
        .where(eq(fundingIntents.id, balanceRow!.id));
      await rejects(recoverDemoReward(b, legacyId), "not found");
      await Promise.all([
        recoverDemoReward(a, legacyId),
        recoverDemoReward(a, legacyId),
      ]);
      const recovered = await demoAccount(a);
      expect(recovered.balance).toBe(legacyAccount.balance);
      expect(
        recovered.positions.find((p) => p.id === legacyId)!.reward?.budget,
      ).toBe(legacy.payout);
      await db
        .update(positions)
        .set({ data: { ...legacyData, payout: "1000000.000000" } })
        .where(eq(positions.id, legacyId));
      await rejects(recoverDemoReward(a, legacyId), "already been spent");
      expect((await demoAccount(a)).balance).toBe(recovered.balance);
    } finally {
      for (const userId of [a, b]) {
        for (const table of [settlements, positions, orders, fundingIntents])
          await db.delete(table).where(eq(table.userId, userId));
        await db.delete(users).where(eq(users.id, userId));
      }
    }
  },
);
