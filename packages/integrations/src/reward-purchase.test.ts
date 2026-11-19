import { expect, test } from "bun:test";
import {
  blockhash,
  address,
  generateKeyPairSigner,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
} from "@solana/kit";
import { rewardAllocation, units } from "@collectible/domain";
import {
  buildDirectCcDevnetDraft,
  inspectCcTransaction,
  CC_PROGRAM,
} from "./collector-crypt-inspection";
import { simulatedCcContext } from "./collector-crypt-fixtures";
import {
  requireUnpaidDemoMint,
  prepareDemoMint,
  submitDemoMint,
  retryDemoMint,
} from "./demo-nft";
import {
  allocateDemoReward,
  demoAccount,
  cancelDemoCollectible,
  collectibleView,
} from "./demo";
import {
  getDb,
  users,
  walletLinks,
  orders,
  positions,
  settlements,
  fundingIntents,
  eq,
} from "@collectible/db";

async function rejects(action: Promise<unknown>, message: string) {
  const [result] = await Promise.allSettled([action]);
  expect(result!.status).toBe("rejected");
  if (result!.status === "rejected")
    expect(String(result!.reason)).toContain(message);
}

test("the buyer wallet pays the full NFT price through the marketplace, including any extra", async () => {
  const allocation = rewardAllocation("145", ["152.25"]);
  expect(allocation.topUp).toBe("7.250000");
  const { context } = await simulatedCcContext();
  context.price = allocation.total;
  const draft = await buildDirectCcDevnetDraft(context, {
    blockhash: blockhash("11111111111111111111111111111111"),
    lastValidBlockHeight: 1000n,
  });
  const reviewed = inspectCcTransaction(draft.unsignedBase64, context);
  expect(Object.keys(reviewed.transaction.signatures)).toEqual([context.buyer]);
  const tx = getTransactionDecoder().decode(
    Buffer.from(draft.unsignedBase64, "base64"),
  );
  const message = getCompiledTransactionMessageDecoder().decode(
    tx.messageBytes,
  );
  if (message.version !== "legacy")
    throw new Error("Unexpected purchase version");
  const buy = message.instructions.find(
    (i) => message.staticAccounts[i.programAddressIndex] === CC_PROGRAM,
  )!;
  expect(Buffer.from(buy.data!).readBigUInt64LE(8)).toBe(units("152.25"));
  expect(buy.accountIndices!.map((i) => message.staticAccounts[i])).toContain(
    address(context.buyerAta),
  );
  expect(buy.accountIndices!.map((i) => message.staticAccounts[i])).toContain(
    address(context.sellerAta),
  );
  expect(message.instructions).toHaveLength(3); // Compute limit, priority fee, marketplace buy. No separate overage transfer.
});

test("demo mint guards reject extra payments and obsolete platform-transfer drafts", () => {
  expect(() => requireUnpaidDemoMint({})).not.toThrow();
  expect(() => requireUnpaidDemoMint({ topUp: "0.000000" })).not.toThrow();
  expect(() =>
    requireUnpaidDemoMint({ topUp: "700", topUpSource: "balance" }),
  ).not.toThrow();
  expect(() => requireUnpaidDemoMint({ topUp: "7.25" })).toThrow(
    "marketplace purchase",
  );
  expect(() =>
    requireUnpaidDemoMint({ topUp: "0", payment: { recipient: "legacy" } }),
  ).toThrow("marketplace purchase");
});

test.skipIf(!process.env.DATABASE_URL)(
  "demo rewards use balance contributions and never revive legacy wallet-transfer drafts",
  async () => {
    const db = getDb();
    const wallet = await generateKeyPairSigner();
    const [user] = await db
      .insert(users)
      .values({ privyId: `direct-reward-${crypto.randomUUID()}` })
      .returning();
    const userId = user!.id;
    try {
      await db.insert(walletLinks).values({
        userId,
        address: wallet.address,
        network: "devnet",
        verifiedAt: new Date(),
      });
      const [position] = await db
        .insert(positions)
        .values({
          userId,
          idempotencyKey: `demo:position:${userId}`,
          state: "won",
          data: {
            eventTicker: "TEST",
            eventTitle: "Spurs",
            symbol: "GEMI-TEST",
            label: "San Antonio",
            quantity: "145",
            cost: "100",
            side: "yes",
            replay: true,
            reward: {
              budget: "145",
              state: "available",
              cardSpend: "0",
              remainder: "145",
            },
          },
        })
        .returning();
      const item = {
        name: "Card",
        image: null,
        source: "grail" as const,
        sourceId: "card",
        sourceUrl: "https://example.com",
        cost: "152.25",
        wallet: wallet.address,
      };
      await rejects(
        allocateDemoReward(
          userId,
          position!.id,
          crypto.randomUUID(),
          [{ ...item, cost: "300" }],
          "155",
        ),
        "Top up your balance",
      );
      let account = await demoAccount(userId);
      expect(account.collectibles).toHaveLength(0);
      expect(account.positions[0]!.reward?.state).toBe("available");
      expect(account.balance).toBe("100.000000");
      const key = crypto.randomUUID();
      await Promise.all([
        allocateDemoReward(
          userId,
          position!.id,
          key,
          [{ ...item, cost: "200" }],
          "55",
        ),
        allocateDemoReward(
          userId,
          position!.id,
          key,
          [{ ...item, cost: "200" }],
          "55",
        ),
      ]);
      account = await demoAccount(userId);
      expect(account.collectibles).toHaveLength(1);
      expect(account.collectibles[0]!.topUp).toBe("55.000000");
      expect(account.collectibles[0]!.topUpSource).toBe("balance");
      expect(account.balance).toBe("45.000000");
      await cancelDemoCollectible(userId, account.collectibles[0]!.id);
      const [legacy] = await db
        .insert(orders)
        .values({
          userId,
          idempotencyKey: `demo:collectible:${userId}:legacy`,
          state: "prepared",
          data: {
            ...item,
            topUp: "7.25",
            payment: { network: "devnet", recipient: wallet.address },
            unsignedBase64: "obsolete",
          },
        })
        .returning();
      await rejects(
        prepareDemoMint(userId, legacy!.id),
        "marketplace purchase",
      );
      await rejects(
        submitDemoMint(userId, legacy!.id, "obsolete"),
        "marketplace purchase",
      );
      await rejects(retryDemoMint(userId, legacy!.id), "marketplace purchase");
      const [saved] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, legacy!.id));
      expect(saved!.state).toBe("prepared");
      expect(collectibleView(saved!).unsignedBase64).toBeUndefined();
    } finally {
      for (const table of [
        settlements,
        orders,
        positions,
        fundingIntents,
        walletLinks,
      ])
        await db.delete(table).where(eq(table.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  },
);
