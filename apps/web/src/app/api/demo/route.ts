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
  marketOutcomes,
  activeMarket,
  money,
  type Book,
  type Market,
  type ProviderResult,
  type DemoCollectible,
  demoSaleQuote,
  units,
  demoPositionContext,
  positionRewardMarket,
  matchingTokens,
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
  listRewardCards,
  providerRead,
  listGrailTokens,
  getGrailRewardDetails,
  prepareDemoMint,
  submitDemoMint,
  checkDemoMint,
  requireDemoWallet,
  expireDemoMint,
  cancelDemoCollectible,
  retryDemoMint,
  allocateDemoReward,
  sellDemoPosition,
  attachCachedValuations,
  recoverDemoReward,
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
    minimumContracts: z.string().regex(/^\d+(\.\d{1,6})?$/),
  }),
  z.object({
    action: z.literal("replay"),
    id,
    result: z.enum(["yes", "no", "void"]),
  }),
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("recover-reward"), id }),
  z.object({ action: z.literal("sell-quote"), id }),
  z.object({
    action: z.literal("sell"),
    id,
    key: id,
    minimumProceeds: z.string().regex(/^\d+(\.\d{1,6})?$/),
  }),
  z.object({
    action: z.literal("claim-reward"),
    id,
    key: id,
    wallet: z.string().min(32).max(44),
    items: z
      .array(
        z.object({
          source: z.enum(["collectorcrypt", "grail"]),
          sourceId: z.string().max(160),
          reserveId: z.string().max(100).optional(),
          expectedCost: z.string().regex(/^\d+(\.\d{1,6})?$/),
        }),
      )
      .min(1)
      .max(20),
  }),
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
          {
            ...DEMO_REPLAY,
            side: b.side,
            stake: b.stake,
            replay: true,
            minimumContracts: b.minimumContracts,
          },
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
            ...demoPositionContext(market.data, contract),
            minimumContracts: b.minimumContracts,
          },
          depth.book,
          depth.observedAt,
        );
      }
    }
    if (b.action === "replay")
      await settleDemoPosition(user.id, b.id, b.result, "replay");
    if (b.action === "refresh") await reconcileDemoPositions(user.id);
    if (b.action === "recover-reward") await recoverDemoReward(user.id, b.id);
    if (b.action === "sell" || b.action === "sell-quote") {
      const position = (await demoAccount(user.id)).positions.find(
        (p) => p.id === b.id,
      );
      if (!position || position.state !== "open")
        throw new ApiError(409, "Open position not found.");
      const depth = position.replay
        ? { book: DEMO_REPLAY.book, observedAt: new Date().toISOString() }
        : await workerRead<{ book: Book | null; observedAt?: string }>(
            `/book?symbol=${encodeURIComponent(position.symbol)}`,
          );
      const observedAt = depth.observedAt ?? depth.book?.updatedAt ?? "";
      if (
        !depth.book ||
        depth.book.symbol !== position.symbol ||
        (!position.replay &&
          (depth.book.source !== "gemini" ||
            depth.book.stale ||
            !Number.isFinite(Date.parse(observedAt)) ||
            Date.parse(observedAt) > Date.now() + 5000 ||
            Date.now() - Date.parse(observedAt) > 20000))
      )
        throw new ApiError(409, "Waiting for fresh bids.");
      if (b.action === "sell-quote") {
        try {
          return Response.json(
            {
              proceeds: demoSaleQuote(position, depth.book),
              quantity: position.quantity,
            },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (e) {
          throw new ApiError(409, (e as Error).message);
        }
      }
      await sellDemoPosition(
        user.id,
        b.id,
        b.key,
        depth.book,
        b.minimumProceeds,
        depth.observedAt,
      );
    }
    if (b.action === "claim-reward") {
      await requireDemoWallet(user.id, b.wallet);
      const position = (await demoAccount(user.id)).positions.find(
        (p) => p.id === b.id,
      );
      if (!position?.reward)
        throw new ApiError(409, "Choose a winning reward first.");
      const subject = positionRewardMarket(position);
      const catalogResult = b.items.some((i) => i.source === "collectorcrypt")
        ? await providerRead(() => listRewardCards(subject), [])
        : { data: [], error: null };
      if (catalogResult.error)
        throw new ApiError(
          503,
          "Card listings are temporarily unavailable. Your reward is still available; try again shortly.",
        );
      const catalog = await attachCachedValuations(catalogResult.data);
      const grail = b.items.some((i) => i.source === "grail")
        ? await listGrailTokens()
        : [];
      const items: Omit<DemoCollectible, "id" | "state">[] = [];
      for (const choice of b.items) {
        let item: Omit<DemoCollectible, "id" | "state">;
        if (choice.source === "collectorcrypt") {
          const card = catalog.find((c) => c.mint === choice.sourceId);
          if (!card)
            throw new ApiError(
              409,
              "A selected card is no longer listed for this outcome. Choose a matching card.",
            );
          item = {
            name: card.name,
            image: card.frontImage
              ? new URL(
                  card.frontImage,
                  process.env.APP_URL ?? "http://localhost:3000",
                ).href
              : null,
            cost: card.ask,
            source: choice.source,
            sourceId: card.mint,
            sourceUrl: `https://collectorcrypt.com/assets/solana/${card.mint}`,
            wallet: b.wallet,
            valuation: card.valuation,
            listing: card,
          };
        } else {
          const token = matchingTokens(subject, grail).find(
            (t) => t.id === choice.sourceId,
          );
          if (!token)
            throw new ApiError(409, "Grail token is no longer available.");
          const details = await getGrailRewardDetails(
            token.chainId,
            token.address,
          );
          const reserve = details.reserves.find(
            (r) => r.id === choice.reserveId && r.available > 0,
          );
          if (
            !reserve ||
            !details.priceUsd ||
            !/^\d+\.\d{12}$/.test(details.priceUsd)
          )
            throw new ApiError(409, "Grail card price is unavailable.");
          const cost = money(
            (BigInt(details.priceUsd.replace(".", "")) *
              units(reserve.tokensPerItem) +
              10n ** 12n -
              1n) /
              10n ** 12n,
          );
          item = {
            name: reserve.name,
            image: reserve.image,
            cost,
            source: "grail",
            sourceId: `${token.id}:${reserve.id}`,
            sourceUrl: token.url,
            wallet: b.wallet,
          };
        }
        if (units(item.cost) !== units(choice.expectedCost))
          throw new ApiError(
            409,
            "A card price changed. Refresh rewards and review your selection.",
          );
        items.push(item);
      }
      await allocateDemoReward(user.id, b.id, b.key, items);
    }
    if (b.action === "collect") {
      throw new ApiError(
        409,
        "Open a winning result in Portfolio and select your rewards.",
      );
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
