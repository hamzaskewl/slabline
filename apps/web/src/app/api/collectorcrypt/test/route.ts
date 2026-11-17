import { z } from "zod";
import { getDb, orders, eq, and, sql } from "@collectible/db";
import {
  listCards,
  prepareCcTest,
  beginCcSigning,
  submitCcTest,
  checkCcTest,
  cancelCcTest,
  retryCcTest,
  ccTestView,
  solanaNetwork,
  CcPurchaseError,
} from "@collectible/integrations";
import { units } from "@collectible/domain";
import {
  apiRoute,
  requireOrigin,
  authenticate,
  boundedJson,
  ApiError,
} from "@/server/auth";
const id = z.string().uuid();
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("prepare"),
      wallet: z.string().min(32).max(44),
      mint: z.string().min(32).max(44),
      idempotencyKey: id,
    })
    .strict(),
  z.object({ action: z.literal("signing"), id }).strict(),
  z
    .object({
      action: z.literal("submit"),
      id,
      signedBase64: z
        .string()
        .min(64)
        .max(4096)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .strict(),
  z.object({ action: z.literal("status"), id }).strict(),
  z.object({ action: z.literal("cancel"), id }).strict(),
  z.object({ action: z.literal("retry"), id }).strict(),
  z.object({ action: z.literal("resume") }).strict(),
]);
export async function GET() {
  return apiRoute(async () => {
    if (solanaNetwork() !== "devnet")
      throw new ApiError(403, "Card test tools are available on devnet only.");
    const cards = (await listCards("", [], "devnet"))
      .filter(
        (c) => c.cert && units(c.ask) > 0n && units(c.ask) <= units("1000"),
      )
      .sort((a, b) => (units(a.ask) < units(b.ask) ? -1 : 1))
      .slice(0, 25);
    return Response.json(
      {
        network: "devnet",
        cards,
        gasSponsorship: false,
        redeemablePhysicalCards: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
export async function POST(request: Request) {
  return apiRoute(async () => {
    requireOrigin(request);
    const user = await authenticate(request);
    const parsed = inputSchema.safeParse(await boundedJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid card test request.");
    const input = parsed.data;
    try {
      if (input.action === "resume")
        return Response.json(
          {
            tests: (
              await getDb()
                .select()
                .from(orders)
                .where(
                  and(
                    eq(orders.userId, user.id),
                    sql`${orders.data}->>'kind'='collectorcrypt-devnet'`,
                  ),
                )
                .orderBy(sql`${orders.createdAt} DESC`)
                .limit(10)
            ).map(ccTestView),
          },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      const result =
        input.action === "prepare"
          ? await prepareCcTest(
              user.id,
              input.wallet,
              input.mint,
              input.idempotencyKey,
            )
          : input.action === "signing"
            ? await beginCcSigning(user.id, input.id)
            : input.action === "submit"
              ? await submitCcTest(user.id, input.id, input.signedBase64)
              : input.action === "cancel"
                ? await cancelCcTest(user.id, input.id)
                : input.action === "retry"
                  ? await retryCcTest(user.id, input.id)
                  : await checkCcTest(user.id, input.id);
      return Response.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      if (e instanceof CcPurchaseError) throw new ApiError(e.status, e.message);
      throw e;
    }
  });
}
