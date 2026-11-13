import { z } from "zod";
import { getFundingQuote } from "@collectible/integrations";
import { decimal, units } from "@collectible/domain";
import {
  getDb,
  walletLinks,
  fundingIntents,
  auditEvents,
  eq,
  and,
} from "@collectible/db";
import {
  apiRoute,
  authenticate,
  requireOrigin,
  boundedJson,
  ApiError,
} from "@/server/auth";
export async function POST(request: Request) {
  return apiRoute(async () => {
    requireOrigin(request);
    const user = await authenticate(request);
    const parsed = z
      .object({
        amount: decimal,
        wallet: z.string().min(32).max(44),
        idempotencyKey: z.string().uuid(),
      })
      .safeParse(await boundedJson(request));
    if (
      !parsed.success ||
      units(parsed.data.amount) <= 0n ||
      units(parsed.data.amount) > units("1000000")
    )
      throw new ApiError(400, "Invalid funding preview");
    const input = parsed.data,
      db = getDb();
    const [wallet] = await db
      .select()
      .from(walletLinks)
      .where(
        and(
          eq(walletLinks.userId, user.id),
          eq(walletLinks.address, input.wallet),
        ),
      )
      .limit(1);
    if (!wallet) throw new ApiError(403, "Destination wallet must be verified");
    const quote = getFundingQuote(input.amount),
      key = `${user.id}:${input.idempotencyKey}`;
    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(fundingIntents)
        .values({
          userId: user.id,
          idempotencyKey: key,
          state: "unsupported",
          amount: input.amount,
          data: { quote, wallet: input.wallet },
        })
        .onConflictDoNothing()
        .returning();
      const row =
        created ??
        (
          await tx
            .select()
            .from(fundingIntents)
            .where(eq(fundingIntents.idempotencyKey, key))
            .limit(1)
        )[0];
      if (!row) throw new ApiError(503, "Unable to save funding intent");
      if (
        units(row.amount) !== units(input.amount) ||
        (row.data as { wallet: string }).wallet !== input.wallet
      )
        throw new ApiError(
          409,
          "Idempotency key was already used for a different amount or wallet",
        );
      if (created)
        await tx.insert(auditEvents).values({
          userId: user.id,
          action: "funding.preview.blocked",
          data: { intentId: row.id },
        });
      return row;
    });
    return Response.json({ intentId: result.id, ...quote, moneyMoved: false });
  });
}
