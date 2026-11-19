import { expect, test } from "bun:test";
import {
  getDb,
  users,
  positions,
  orders,
  fundingIntents,
  settlements,
  eq,
} from "@collectible/db";
import {
  demoAccount,
  demoTopUp,
  allocateDemoReward,
  cancelDemoCollectible,
  cashDemoReward,
  finalizeDemoReward,
  recoverDemoReward,
  reserveDemoCollectible,
} from "./demo";

test.skipIf(!process.env.DATABASE_URL)(
  "optional rewards release leftovers immediately and conserve funds across retries, spending, and cancellation",
  async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ privyId: `portfolio-rewards-${crypto.randomUUID()}` })
      .returning();
    const userId = user!.id;
    const item = {
      name: "Test card",
      image: null,
      source: "grail" as const,
      sourceId: "first",
      sourceUrl: "https://example.com",
      cost: "10",
      wallet: "test-wallet",
    };
    try {
      const [position] = await db
        .insert(positions)
        .values({
          userId,
          idempotencyKey: `demo:position:${userId}`,
          state: "won",
          data: {
            eventTicker: "TEST",
            eventTitle: "Test",
            symbol: "GEMI-TEST",
            label: "Test",
            replay: true,
            payout: "100",
            quantity: "100",
            cost: "20",
            side: "yes",
            reward: {
              budget: "100",
              state: "available",
              cardSpend: "0",
              remainder: "100",
            },
          },
        })
        .returning();
      const id = position!.id;
      const key = crypto.randomUUID();
      await Promise.all([
        allocateDemoReward(userId, id, key, [item]),
        allocateDemoReward(userId, id, key, [item]),
      ]);
      let account = await demoAccount(userId);
      expect(account.balance).toBe("190.000000");
      expect(account.collectibles).toHaveLength(1);
      const cardId = account.collectibles[0]!.id;
      await reserveDemoCollectible(userId, crypto.randomUUID(), {
        ...item,
        sourceId: "spent-leftovers",
        cost: "190",
      });
      await cancelDemoCollectible(userId, cardId);
      account = await demoAccount(userId);
      expect(account.balance).toBe("0.000000");
      expect(account.positions[0]!.reward?.budget).toBe("10.000000");
      await Promise.all([
        cashDemoReward(userId, id),
        cashDemoReward(userId, id),
      ]);
      expect((await demoAccount(userId)).balance).toBe("10.000000");
      const topupKey = crypto.randomUUID();
      await Promise.all([
        demoTopUp(userId, topupKey, "23.45"),
        demoTopUp(userId, topupKey, "23.45"),
      ]);
      expect((await demoAccount(userId)).balance).toBe("33.450000");
      await expect(demoTopUp(userId, crypto.randomUUID(), "0")).rejects.toThrow(
        "Enter an amount",
      );
      const [legacy] = await db
        .insert(positions)
        .values({
          userId,
          idempotencyKey: `demo:position:legacy:${userId}`,
          state: "won",
          data: {
            eventTicker: "TEST",
            eventTitle: "Test",
            symbol: "GEMI-TEST",
            label: "Test",
            replay: true,
            payout: "90",
            quantity: "90",
            cost: "93",
          },
        })
        .returning();
      await recoverDemoReward(userId, legacy!.id);
      await recoverDemoReward(userId, legacy!.id);
      account = await demoAccount(userId);
      expect(account.balance).toBe("33.450000");
      expect(
        account.positions.find((p) => p.id === legacy!.id)?.reward,
      ).toMatchObject({ state: "claimed", delivery: "cash" });
      // Delivery confirmation must never pay an already credited remainder again.
      await finalizeDemoReward(userId, cardId);
      expect((await demoAccount(userId)).balance).toBe("33.450000");
    } finally {
      for (const table of [settlements, orders, positions, fundingIntents])
        await db.delete(table).where(eq(table.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  },
);
