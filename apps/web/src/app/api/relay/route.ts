import { z } from "zod";
import {
  getDb,
  walletLinks,
  relayRequests,
  eq,
  and,
  gt,
  sql,
} from "@collectible/db";
import { relayQuoteInput } from "@collectible/domain";
import {
  relayCapabilities,
  saveRelayQuote,
  refreshRelayStatus,
  relayRecordView,
  assertRelayExecutionDisabled,
  RelayError,
} from "@collectible/integrations";
import {
  apiRoute,
  authenticate,
  requireOrigin,
  boundedJson,
  ApiError,
} from "@/server/auth";

const inputSchema = z.discriminatedUnion("action", [
  relayQuoteInput
    .extend({ action: z.literal("quote"), idempotencyKey: z.string().uuid() })
    .strict(),
  z.object({ action: z.literal("wallets") }).strict(),
  z.object({ action: z.literal("resume") }).strict(),
  z.object({ action: z.literal("status"), id: z.string().uuid() }).strict(),
]);
let discovery:
  | { expires: number; value: Awaited<ReturnType<typeof relayCapabilities>> }
  | undefined;
export async function GET() {
  return apiRoute(async () => {
    if (!discovery || discovery.expires < Date.now())
      discovery = {
        expires: Date.now() + 60000,
        value: await relayCapabilities(),
      };
    return Response.json(
      {
        capabilities: discovery.value,
        executionEnabled: false,
        gasSponsorship: false,
        solanaDevnetSupported: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
export async function POST(request: Request) {
  return apiRoute(async () => {
    requireOrigin(request);
    const user = await authenticate(request);
    const body = await boundedJson(request);
    if (
      body &&
      typeof body === "object" &&
      "action" in body &&
      ["execute", "prepare", "sign", "broadcast"].includes(String(body.action))
    ) {
      try {
        assertRelayExecutionDisabled();
      } catch {
        throw new ApiError(
          403,
          "Bridge execution is disabled. Quotes cannot move funds.",
        );
      }
    }
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, "Invalid Relay request.");
    const input = parsed.data;
    try {
      if (input.action === "wallets")
        return Response.json({
          wallets: await getDb()
            .select({
              address: walletLinks.address,
              network: walletLinks.network,
            })
            .from(walletLinks)
            .where(eq(walletLinks.userId, user.id)),
        });
      if (input.action === "resume") {
        const rows = await getDb()
          .select()
          .from(relayRequests)
          .where(
            and(
              eq(relayRequests.userId, user.id),
              gt(relayRequests.createdAt, new Date(Date.now() - 7 * 86400000)),
              sql`${relayRequests.data}->>'kind' = 'relay-preview'`,
            ),
          )
          .orderBy(sql`${relayRequests.createdAt} DESC`)
          .limit(10);
        return Response.json({
          quotes: rows.map((row) => relayRecordView(row)),
        });
      }
      const record =
        input.action === "quote"
          ? await saveRelayQuote(
              user.id,
              relayQuoteInput.parse({
                routeId: input.routeId,
                wallet: input.wallet,
                recipient: input.recipient,
                amount: input.amount,
              }),
              input.idempotencyKey,
            )
          : await refreshRelayStatus(user.id, input.id);
      return Response.json(record, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error instanceof RelayError)
        throw new ApiError(error.status, error.message);
      if (
        error instanceof z.ZodError ||
        (error instanceof Error &&
          /decimal places|quote range/.test(error.message))
      )
        throw new ApiError(400, "Check the amount and wallet addresses.");
      throw error;
    }
  });
}
