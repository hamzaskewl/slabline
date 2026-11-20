import { z } from "zod";
import {
  apiRoute,
  authenticate,
  boundedJson,
  requireOrigin,
  ApiError,
} from "../../../../server/auth";
import {
  DemoError,
  requireDemoNetwork,
  withSolanaNetwork,
  usdcTransfers,
} from "@collectible/integrations";
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare"),
    key: z.string().uuid(),
    direction: z.enum(["deposit", "withdraw"]),
    wallet: z.string().min(32).max(44),
    amount: z.string().max(32),
  }),
  z.object({
    action: z.literal("submit"),
    id: z.string().uuid(),
    signedBase64: z.string().min(1).max(6000).optional(),
  }),
  z.object({ action: z.literal("check"), id: z.string().uuid() }),
]);
function route(request: Request, action: () => Promise<unknown>) {
  return apiRoute(() =>
    withSolanaNetwork("devnet", async () => {
      try {
        requireDemoNetwork(request.headers.get("x-market-network"));
        return Response.json(await action(), {
          headers: { "Cache-Control": "private, no-store" },
        });
      } catch (e) {
        if (e instanceof DemoError) throw new ApiError(e.status, e.message);
        throw e;
      }
    }),
  );
}
export async function GET(request: Request) {
  return route(request, async () => {
    const user = await authenticate(request);
    const wallet = new URL(request.url).searchParams.get("wallet") || undefined;
    return usdcTransfers.account(user.id, wallet);
  });
}
export async function POST(request: Request) {
  return route(request, async () => {
    requireOrigin(request);
    const user = await authenticate(request);
    const parsed = schema.safeParse(await boundedJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid transfer request.");
    const b = parsed.data;
    if (b.action === "prepare")
      return usdcTransfers.prepare(
        user.id,
        b.key,
        b.direction,
        b.wallet,
        b.amount,
      );
    if (b.action === "submit")
      return usdcTransfers.submit(user.id, b.id, b.signedBase64);
    return usdcTransfers.check(user.id, b.id);
  });
}
