import { expect, test } from "bun:test";
import {
  getDb,
  users,
  walletLinks,
  orders,
  orderItems,
  auditEvents,
  eq,
} from "@collectible/db";
import { type Listing } from "@collectible/domain";
import { simulatedCcContext } from "./collector-crypt-fixtures";
import {
  buildDirectCcDevnetDraft,
  inspectCcTransaction,
} from "./collector-crypt-inspection";
import {
  prepareCcTest,
  ownedCcTest,
  beginCcSigning,
  submitCcTest,
  cancelCcTest,
  ccSigningBlocker,
} from "./collector-crypt-purchases";
import { blockhash } from "@solana/kit";

test("Collector Crypt test signing requires an explicit devnet wallet allowlist even if other live flags are set", () => {
  const names = [
      "SOLANA_NETWORK",
      "ENABLE_CC_DEVNET_TESTS",
      "CC_DEVNET_TEST_WALLET",
      "ENABLE_CC_PURCHASES",
    ],
    prior = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  try {
    process.env.SOLANA_NETWORK = "devnet";
    process.env.ENABLE_CC_PURCHASES = "true";
    delete process.env.ENABLE_CC_DEVNET_TESTS;
    expect(ccSigningBlocker("wallet")).toContain("Signing is off");
    process.env.ENABLE_CC_DEVNET_TESTS = "true";
    process.env.CC_DEVNET_TEST_WALLET = "approved-wallet";
    expect(ccSigningBlocker("wallet")).toContain("Signing is off");
    expect(ccSigningBlocker("approved-wallet")).toBeNull();
    process.env.SOLANA_NETWORK = "mainnet";
    expect(ccSigningBlocker("approved-wallet")).toContain("devnet");
  } finally {
    for (const n of names)
      if (prior[n] === undefined) delete process.env[n];
      else process.env[n] = prior[n];
  }
});
test.skipIf(!process.env.DATABASE_URL)(
  "Postgres binds card drafts to their wallet/user, deduplicates requests, and blocks unsigned or unapproved execution",
  async () => {
    const db = getDb(),
      { context } = await simulatedCcContext(),
      [a, b] = await db
        .insert(users)
        .values([
          { privyId: `SIMULATED-CC-A-${crypto.randomUUID()}` },
          { privyId: `SIMULATED-CC-B-${crypto.randomUUID()}` },
        ])
        .returning();
    if (!a || !b) throw new Error("Fixture setup");
    const old = process.env.ENABLE_CC_DEVNET_TESTS;
    delete process.env.ENABLE_CC_DEVNET_TESTS;
    try {
      await db.insert(walletLinks).values({
        userId: a.id,
        address: context.buyer,
        network: "devnet",
        verifiedAt: new Date(),
      });
      const card: Listing = {
        id: "SIMULATED_CC_PURCHASE",
        name: "Simulated devnet card",
        mint: context.mint,
        seller: context.seller,
        network: "devnet",
        source: "collectorcrypt",
        currency: "USDC",
        ask: "26",
        grade: "10",
        grader: "PSA",
        cert: "fixture",
        player: null,
        category: "Test fixture",
        year: null,
        set: null,
        frontImage: null,
        backImage: null,
        observedAt: new Date().toISOString(),
        valuation: null,
      };
      let calls = 0;
      const dependencies = {
        cards: async () => [card],
        prepare: async () => {
          calls++;
          await new Promise((r) => setTimeout(r, 30));
          const draft = await buildDirectCcDevnetDraft(context, {
            blockhash: blockhash("11111111111111111111111111111111"),
            lastValidBlockHeight: 1n,
          });
          return {
            context,
            draft,
            simulation: {
              source: "solana_simulation" as const,
              network: "devnet" as const,
              slot: "1",
              feeLamports: "9000",
              totalSolCostLamports: "9000",
              priceBaseUnits: "26000000",
              platformFeeBaseUnits: "520000",
              messageBase64: inspectCcTransaction(draft.unsignedBase64, context)
                .messageHash,
              observedAt: new Date().toISOString(),
              moneyMoved: false as const,
            },
          };
        },
      };
      const key = crypto.randomUUID();
      const results = await Promise.allSettled([
        prepareCcTest(a.id, context.buyer, context.mint, key, dependencies),
        prepareCcTest(a.id, context.buyer, context.mint, key, dependencies),
      ]);
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);
      expect(calls).toBe(1);
      const saved = await prepareCcTest(
        a.id,
        context.buyer,
        context.mint,
        key,
        dependencies,
      );
      expect(saved.state).toBe("prepared");
      expect(saved.canSign).toBe(false);
      expect(saved.unsignedBase64).toBeUndefined();
      expect(saved.simulation).not.toHaveProperty("messageBase64");
      expect(saved.simulation?.moneyMoved).toBe(false);
      expect(saved.signature).toBeNull();
      expect(calls).toBe(1);
      await expect(ownedCcTest(b.id, saved.id)).rejects.toThrow("not found");
      await expect(
        prepareCcTest(
          b.id,
          context.buyer,
          context.mint,
          crypto.randomUUID(),
          dependencies,
        ),
      ).rejects.toThrow("Verify");
      await expect(
        prepareCcTest(
          a.id,
          context.buyer,
          context.collection,
          key,
          dependencies,
        ),
      ).rejects.toThrow("another card");
      await expect(beginCcSigning(a.id, saved.id)).rejects.toThrow(
        "Signing is off",
      );
      await db
        .update(orders)
        .set({ state: "awaiting_signature" })
        .where(eq(orders.id, saved.id));
      await expect(
        submitCcTest(a.id, saved.id, "not-a-signature"),
      ).rejects.toThrow("Signing is off");
      expect((await cancelCcTest(a.id, saved.id)).state).toBe("cancelled");
      expect(
        (
          await prepareCcTest(
            a.id,
            context.buyer,
            context.mint,
            key,
            dependencies,
          )
        ).state,
      ).toBe("cancelled");
      const interrupted = crypto.randomUUID();
      const [row] = await db
        .insert(orders)
        .values({
          userId: a.id,
          idempotencyKey: `cc-devnet:${a.id}:${interrupted}`,
          state: "building",
          createdAt: new Date(Date.now() - 120000),
          data: {
            kind: "collectorcrypt-devnet",
            wallet: context.buyer,
            mint: context.mint,
          },
        })
        .returning();
      await db.insert(orderItems).values({
        orderId: row!.id,
        mint: context.mint,
        state: "building",
        data: { fixture: true },
      });
      expect(
        (
          await prepareCcTest(
            a.id,
            context.buyer,
            context.mint,
            interrupted,
            dependencies,
          )
        ).state,
      ).toBe("failed");
    } finally {
      for (const u of [a, b]) {
        for (const row of await db
          .select()
          .from(orders)
          .where(eq(orders.userId, u.id)))
          await db.delete(orderItems).where(eq(orderItems.orderId, row.id));
        await db.delete(orders).where(eq(orders.userId, u.id));
        await db.delete(auditEvents).where(eq(auditEvents.userId, u.id));
        await db.delete(walletLinks).where(eq(walletLinks.userId, u.id));
        await db.delete(users).where(eq(users.id, u.id));
      }
      if (old === undefined) delete process.env.ENABLE_CC_DEVNET_TESTS;
      else process.env.ENABLE_CC_DEVNET_TESTS = old;
    }
  },
);
