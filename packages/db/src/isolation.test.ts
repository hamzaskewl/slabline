import { expect, test } from "bun:test";
import {
  getDb,
  users,
  walletChallenges,
  fundingIntents,
  eq,
  and,
  isNull,
} from "./index";
test.skipIf(!process.env.DATABASE_URL)(
  "Postgres isolates users, consumes wallet nonces once and deduplicates funding",
  async () => {
    const db = getDb();
    const marker = "ROLL_BACK_TEST";
    try {
      await db.transaction(async (tx) => {
        const [a, b] = await tx
          .insert(users)
          .values([
            { privyId: `fixture-a-${crypto.randomUUID()}` },
            { privyId: `fixture-b-${crypto.randomUUID()}` },
          ])
          .returning();
        if (!a || !b) throw new Error("User fixture setup failed");
        const nonce = crypto.randomUUID();
        await tx.insert(walletChallenges).values({
          nonce,
          userId: a.id,
          address: "fixture-address",
          message: "fixture-proof",
          expiresAt: new Date(Date.now() + 60000),
        });
        const other = await tx
          .select()
          .from(walletChallenges)
          .where(
            and(
              eq(walletChallenges.nonce, nonce),
              eq(walletChallenges.userId, b.id),
            ),
          );
        expect(other).toHaveLength(0);
        const condition = and(
          eq(walletChallenges.nonce, nonce),
          eq(walletChallenges.userId, a.id),
          isNull(walletChallenges.usedAt),
        );
        expect(
          await tx
            .update(walletChallenges)
            .set({ usedAt: new Date() })
            .where(condition)
            .returning(),
        ).toHaveLength(1);
        expect(
          await tx
            .update(walletChallenges)
            .set({ usedAt: new Date() })
            .where(condition)
            .returning(),
        ).toHaveLength(0);
        const key = `${a.id}:${crypto.randomUUID()}`;
        const value = {
          userId: a.id,
          idempotencyKey: key,
          state: "unsupported",
          amount: "10",
          data: { fixture: true },
        };
        expect(
          await tx
            .insert(fundingIntents)
            .values(value)
            .onConflictDoNothing()
            .returning(),
        ).toHaveLength(1);
        expect(
          await tx
            .insert(fundingIntents)
            .values(value)
            .onConflictDoNothing()
            .returning(),
        ).toHaveLength(0);
        expect(
          await tx
            .select()
            .from(fundingIntents)
            .where(eq(fundingIntents.userId, b.id)),
        ).toHaveLength(0);
        throw new Error(marker);
      });
    } catch (e) {
      if (!(e instanceof Error) || e.message !== marker) throw e;
    }
  },
);
