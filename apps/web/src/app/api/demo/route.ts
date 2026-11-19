import { z } from "zod";
import {
  apiRoute,
  authenticate,
  boundedJson,
  requireOrigin,
  ApiError,
} from "@/server/auth";
import { workerRead } from "@/server/router";
import {
  DEMO_REPLAY,
  DEMO_REPLAY_CARD,
  marketOutcomes,
  activeMarket,
  money,
  type Book,
  type Market,
  type ProviderResult,
} from "@collectible/domain";
import {
  withSolanaNetwork,
  demoAccount,
  demoBuy,
  demoTopUp,
  settleDemoPosition,
  reconcileDemoPositions,
  requireDemoNetwork,
  DemoError,
  listCards,
  listGrailTokens,
  getGrailRewardDetails,
  reserveDemoCollectible,
  prepareDemoMint,
  submitDemoMint,
  checkDemoMint,
  requireDemoWallet,
  expireDemoMint,
  cancelDemoCollectible,
  retryDemoMint,
} from "@collectible/integrations";
const id = z.string().uuid();
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("topup"), key: id }),
  z.object({
    action: z.literal("buy"),
    key: id,
    eventTicker: z.string().regex(/^[A-Za-z0-9_-]{1,150}$/),
    symbol: z.string().regex(/^GEMI-[A-Z0-9-]{1,115}$/),
    side: z.enum(["yes", "no"]),
    stake: z.string().regex(/^\d+(\.\d{1,6})?$/),
    replay: z.boolean(),
  }),
  z.object({
    action: z.literal("replay"),
    id,
    result: z.enum(["yes", "no", "void"]),
  }),
  z.object({ action: z.literal("refresh") }),
  z.object({
    action: z.literal("collect"),
    key: id,
    source: z.enum(["collectorcrypt", "grail"]),
    sourceId: z.string().max(160),
    reserveId: z.string().max(100).optional(),
    wallet: z.string().min(32).max(44),
  }),
  z.object({ action: z.literal("prepare"), id }),
  z.object({
    action: z.literal("submit"),
    id,
    signedBase64: z.string().max(6000),
  }),
  z.object({ action: z.literal("check"), id }),
  z.object({ action: z.literal("retry"), id }),
  z.object({ action: z.literal("refund"), id }),
]);
async function demoRoute(action: () => Promise<Response>) {
  return apiRoute(() =>
    withSolanaNetwork("devnet", async () => {
      try {
        return await action();
      } catch (e) {
        if (e instanceof DemoError) throw new ApiError(e.status, e.message);
        throw e;
      }
    }),
  );
}
export async function GET(request: Request) {
  return demoRoute(async () => {
    const user = await authenticate(request);
    const result = await demoAccount(user.id);
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
export async function POST(request: Request) {
  return demoRoute(async () => {
    requireOrigin(request);
    requireDemoNetwork(request.headers.get("x-market-network"));
    const user = await authenticate(request);
    const parsed = bodySchema.safeParse(await boundedJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid request.");
    const b = parsed.data;
    if (b.action === "topup") await demoTopUp(user.id, b.key);
    if (b.action === "buy") {
      if (b.replay) {
        if (b.symbol !== DEMO_REPLAY.book.symbol)
          throw new ApiError(400, "Open the replay market from Settings.");
        await demoBuy(
          user.id,
          b.key,
          { ...DEMO_REPLAY, side: b.side, stake: b.stake, replay: true },
          DEMO_REPLAY.book,
        );
      } else {
        const [market, depth] = await Promise.all([
          workerRead<ProviderResult<Market | null>>(
            `/market?id=${encodeURIComponent(b.eventTicker)}`,
          ),
          workerRead<{ book: Book | null; observedAt?: string }>(
            `/book?symbol=${encodeURIComponent(b.symbol)}`,
          ),
        ]);
        const contract =
          market.data &&
          marketOutcomes(market.data).find((c) => c.symbol === b.symbol);
        if (
          !market.data ||
          !activeMarket(market.data) ||
          !contract ||
          !["active", "open"].includes(contract.status.toLowerCase()) ||
          !depth.book ||
          depth.book.symbol !== b.symbol
        )
          throw new ApiError(
            409,
            "This market is not accepting orders or its depth is unavailable.",
          );
        await demoBuy(
          user.id,
          b.key,
          {
            eventTicker: market.data.ticker ?? b.eventTicker,
            eventTitle: market.data.title,
            label: contract.label,
            side: b.side,
            stake: b.stake,
            replay: false,
          },
          depth.book,
          depth.observedAt,
        );
      }
    }
    if (b.action === "replay")
      await settleDemoPosition(user.id, b.id, b.result, "replay");
    if (b.action === "refresh") await reconcileDemoPositions(user.id);
    if (b.action === "collect") {
      await requireDemoWallet(user.id, b.wallet);
      let item: {
        name: string;
        image: string | null;
        cost: string;
        sourceUrl: string;
      };
      if (b.source === "collectorcrypt") {
        const card =
          b.sourceId === DEMO_REPLAY_CARD.mint
            ? DEMO_REPLAY_CARD
            : (await listCards("", [], "mainnet")).find(
                (c) => c.mint === b.sourceId,
              );
        if (!card) throw new ApiError(409, "This card is no longer listed.");
        item = {
          name: card.name,
          image: card.frontImage
            ? new URL(
                card.frontImage,
                process.env.APP_URL ?? "http://localhost:3000",
              ).href
            : null,
          cost: card.ask,
          sourceUrl: `https://collectorcrypt.com/assets/solana/${card.mint}`,
        };
      } else {
        const token = (await listGrailTokens()).find(
          (t) => t.id === b.sourceId,
        );
        if (!token) throw new ApiError(404, "Grail token not found.");
        const details = await getGrailRewardDetails(
          token.chainId,
          token.address,
        );
        const reserve = details.reserves.find(
          (r) => r.id === b.reserveId && r.available > 0,
        );
        if (
          !reserve ||
          !details.priceUsd ||
          !/^\d+\.\d{12}$/.test(details.priceUsd) ||
          !/^\d+(\.\d{1,6})?$/.test(reserve.tokensPerItem)
        )
          throw new ApiError(
            409,
            "This Grail reserve has no available card or current price.",
          );
        const multiplier = BigInt(
          reserve.tokensPerItem.replace(".", "") +
            "0".repeat(6 - (reserve.tokensPerItem.split(".")[1]?.length ?? 0)),
        );
        const value =
          (BigInt(details.priceUsd.replace(".", "")) * multiplier +
            10n ** 12n -
            1n) /
          10n ** 12n;
        item = {
          name: reserve.name,
          image: reserve.image,
          cost: money(value),
          sourceUrl: token.url,
        };
      }
      if (!item.image)
        throw new ApiError(409, "This card has no image available.");
      const row = await reserveDemoCollectible(user.id, b.key, {
        ...item,
        wallet: b.wallet,
        source: b.source,
        sourceId: b.sourceId + (b.reserveId ? `:${b.reserveId}` : ""),
      });
      return Response.json(await prepareDemoMint(user.id, row.id), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (b.action === "prepare")
      return Response.json(await prepareDemoMint(user.id, b.id));
    if (b.action === "submit")
      return Response.json(await submitDemoMint(user.id, b.id, b.signedBase64));
    if (b.action === "check")
      return Response.json(await checkDemoMint(user.id, b.id));
    if (b.action === "retry")
      return Response.json(await retryDemoMint(user.id, b.id));
    if (b.action === "refund") {
      await expireDemoMint(user.id, b.id);
      await cancelDemoCollectible(user.id, b.id);
    }
    return Response.json(await demoAccount(user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
