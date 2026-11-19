import { expect, test } from "bun:test";
import {
  getDb,
  users,
  orders,
  pullOpenings,
  fundingIntents,
  positions,
  inArray,
} from "@collectible/db";
import {
  PULL_OUTCOMES,
  PULL_TIERS,
  pullOutcome,
  units,
  type Book,
} from "@collectible/domain";
import { demoBuy, demoBuyQuote } from "./demo";
import {
  fulfillPull,
  fulfilledPullBucket,
  openPull,
  pullAccount,
  pullAward,
  pullOpening,
  pullPendingRequest,
} from "./pull";

test("opening odds have exactly 98% expected buying budget at every pack price", () => {
  const counts = new Map<string, number>();
  for (let bucket = 0; bucket < 10000; bucket++) {
    const { multiplier } = pullOutcome(bucket);
    counts.set(multiplier, (counts.get(multiplier) ?? 0) + 1);
  }
  expect(Array.from(counts.values())).toEqual([6200, 2800, 640, 360]);
  for (const tier of PULL_TIERS) {
    const weighted = [0, 6200, 9000, 9640].reduce(
      (sum, bucket, index) =>
        sum +
        units(pullAward(tier, bucket).budget) *
          BigInt(PULL_OUTCOMES[index]!.weightBps),
      0n,
    );
    expect(weighted).toBe(units(String(tier)) * 9800n);
  }
  expect(pullOutcome(6199).multiplier).toBe("0.6");
  expect(pullOutcome(8999).multiplier).toBe("1.2");
  expect(pullOutcome(9639).multiplier).toBe("2");
  expect(pullOutcome(9999).multiplier).toBe("4");
  expect(() => pullOutcome(10000)).toThrow();
});

test("MagicBlock mapping accepts each bucket exactly six times and skips rejected candidates", () => {
  const counts = new Uint8Array(10000);
  const bytes = Buffer.alloc(32, 0xff);
  for (let candidate = 0; candidate < 60000; candidate++) {
    bytes.writeUInt16BE(candidate);
    const bucket = fulfilledPullBucket(bytes.toString("hex"));
    counts[bucket]!++;
  }
  expect(counts.every((count) => count === 6)).toBe(true);
  bytes.writeUInt16BE(60000);
  bytes.writeUInt16BE(9640, 2);
  expect(fulfilledPullBucket(bytes.toString("hex"))).toBe(9640);
  expect(() => fulfilledPullBucket("FFFF")).toThrow();
});

test.skipIf(!process.env.DATABASE_URL)(
  "Pull ledger isolates owners and charges, fulfills and redeems each opening once",
  async () => {
    const db = getDb();
    const [owner, other] = await db
      .insert(users)
      .values(
        [0, 1].map(() => ({ privyId: `pull-fixture-${crypto.randomUUID()}` })),
      )
      .returning();
    const ids = [owner!.id, other!.id];
    const userId = owner!.id;
    const key = crypto.randomUUID();
    const theme = { kind: "team", label: "Toronto" } as const;
    try {
      await expect(
        openPull(userId, key, 200, "demo-csprng", null, theme),
      ).rejects.toThrow("Insufficient");
      const [local, retry] = await Promise.all([
        openPull(userId, key, 25, "demo-csprng", null, theme),
        openPull(userId, key, 25, "demo-csprng", null, theme),
      ]);
      expect(local).toEqual(retry);
      expect(await pullOpening(userId, local.id)).toEqual(local);
      expect(await pullAccount(userId)).toEqual({
        balance: "75.000000",
        openings: [local],
      });
      await expect(pullOpening(other!.id, local.id)).rejects.toThrow(
        "not found",
      );
      await expect(
        openPull(userId, key, 50, "demo-csprng", null, theme),
      ).rejects.toThrow("already used");

      const funded = await openPull(
        userId,
        crypto.randomUUID(),
        50,
        "magicblock-devnet",
        "wallet-fixture",
        { kind: "all" },
      );
      expect(funded.budget).toBeNull();
      const { seedHex } = await pullPendingRequest(userId, funded.id);
      const proof = {
        seedHex,
        requestAddress: "test-address",
        requestSignature: crypto.randomUUID(),
        randomnessHex: "00".repeat(32),
        slot: "100",
      };
      await expect(
        fulfillPull(userId, funded.id, { ...proof, seedHex: "00".repeat(32) }),
      ).rejects.toThrow("does not match");
      await expect(fulfillPull(other!.id, funded.id, proof)).rejects.toThrow(
        "not found",
      );
      const [award, sameAward] = await Promise.all([
        fulfillPull(userId, funded.id, proof),
        fulfillPull(userId, funded.id, proof),
      ]);
      expect(award).toEqual(sameAward);
      expect(award.budget).toBe("30.000000");
      const book: Book = {
        symbol: "GEMI-TEST",
        bids: [{ price: "0.7", quantity: "40" }],
        asks: [{ price: "0.6", quantity: "20" }],
        quantityIncrement: "1",
        priceIncrement: "0.1",
        updatedAt: new Date().toISOString(),
        source: "gemini",
        stale: false,
      };
      const entry = {
        eventTicker: "TEST",
        eventTitle: "Test event",
        label: "Test contract",
        side: "no" as const,
        stake: award.budget!,
        replay: false,
        minimumContracts: "40",
      };
      const quote = demoBuyQuote(entry, book);
      expect(quote).toMatchObject({
        contracts: "40.000000",
        cost: "12.000000",
        unspent: "18.000000",
      });
      const redeem = (id = userId, sample = book, side: "yes" | "no" = "no") =>
        demoBuy(
          id,
          `pull:${funded.id}`,
          { ...entry, side },
          sample,
          sample.updatedAt,
          funded.id,
        );
      await expect(redeem(other!.id)).rejects.toThrow("not found");
      await expect(redeem(userId, { ...book, stale: true })).rejects.toThrow(
        "fresh",
      );
      await expect(redeem(userId, book, "yes")).rejects.toThrow(
        "price changed",
      );
      expect((await pullOpening(userId, funded.id)).state).toBe("ready");
      const [position, repeatedPosition] = await Promise.all([
        redeem(),
        redeem(),
      ]);
      expect(position).toBe(repeatedPosition);
      expect(await pullOpening(userId, funded.id)).toMatchObject({
        state: "redeemed",
        positionId: position,
        redemption: {
          side: "no",
          cost: "12.000000",
          quantity: "40.000000",
          remainder: "18.000000",
        },
      });
      expect((await pullAccount(userId)).balance).toBe("43.000000");
      const saved = await db
        .select()
        .from(positions)
        .where(inArray(positions.userId, ids));
      expect(saved).toHaveLength(1);
      expect(saved[0]?.data).toMatchObject({
        side: "no",
        quantity: "40.000000",
        cost: "12.000000",
      });
      const receipts = await db
        .select()
        .from(orders)
        .where(inArray(orders.userId, ids));
      expect(receipts).toHaveLength(1);
      expect(receipts[0]?.data).toMatchObject({ pullOpeningId: funded.id });
    } finally {
      await db.delete(pullOpenings).where(inArray(pullOpenings.userId, ids));
      await db.delete(orders).where(inArray(orders.userId, ids));
      await db.delete(positions).where(inArray(positions.userId, ids));
      await db
        .delete(fundingIntents)
        .where(inArray(fundingIntents.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
  },
);
