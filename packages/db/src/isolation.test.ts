import { expect, test } from "bun:test";
import {
  getDb,
  users,
  walletChallenges,
  fundingIntents,
  orders,
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
        const [order] = await tx
          .insert(orders)
          .values({
            userId: a.id,
            idempotencyKey: `grail:${key}`,
            state: "quoted",
            data: { fixture: true },
          })
          .returning();
        if (!order) throw new Error("Order fixture missing");
        const claim = (userId: string) =>
          tx
            .update(orders)
            .set({ state: "prepared" })
            .where(
              and(
                eq(orders.id, order.id),
                eq(orders.userId, userId),
                eq(orders.state, "quoted"),
              ),
            )
            .returning();
        expect(await claim(b.id)).toHaveLength(0);
        expect(await claim(a.id)).toHaveLength(1);
        expect(await claim(a.id)).toHaveLength(0);
        const prompt = () =>
          tx
            .update(orders)
            .set({ state: "awaiting_signature" })
            .where(
              and(
                eq(orders.id, order.id),
                eq(orders.userId, a.id),
                eq(orders.state, "prepared"),
              ),
            )
            .returning();
        expect(await prompt()).toHaveLength(1);
        expect(await prompt()).toHaveLength(0);

        expect(
          await tx
            .insert(orders)
            .values({
              userId: a.id,
              idempotencyKey: `grail:${key}`,
              state: "quoted",
              data: { fixture: true },
            })
            .onConflictDoNothing()
            .returning(),
        ).toHaveLength(0);
        throw new Error(marker);
      });
    } catch (e) {
      if (!(e instanceof Error) || e.message !== marker) throw e;
    }
  },
);
