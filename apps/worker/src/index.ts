import {
  geminiClient,
  listCards,
  listGrailTokens,
  getGrailRewardDetails,
  listPacks,
  cached,
  providerRead,
  attachCachedValuations,
  enqueueValuations,
  processValuationJob,
  recoverValuationJobs,
  cacheCardIdentities,
  getPriceHistory,
} from "@collectible/integrations";
import {
  marketPreview,
  discoveryMarkets,
  rewardCategories,
  type Book,
  type Market,
  type PricePoint,
  type ChartRange,
  DEMO_REPLAY_CARD,
} from "@collectible/domain";
import { getDb, marketSnapshots } from "@collectible/db";
import { processWebhookDelivery } from "./reconciliation";
import { searchCatalog } from "./market-search";
import {
  savedMarkets,
  savedMarket,
  savedContract,
  knownMarkets,
  startMarketRefresh,
} from "./market-store";

type Session = {
  book: Book | null;
  latestTrade: PricePoint | null;
  lastAccess: number;
  close: () => void;
};
const books = new Map<string, Session>();
const pendingBooks = new Map<string, Promise<Session>>();
async function rewardInventory(data: Market[]) {
  const [cards, tokens] = await Promise.all([
    providerRead(() => listCards("", rewardCategories(data)), []),
    providerRead(listGrailTokens, []),
  ]);
  return {
    cards: await attachCachedValuations(cards.data),
    replayCard: (await attachCachedValuations([DEMO_REPLAY_CARD]))[0],
    tokens: tokens.data,
    error:
      [
        cards.error ? "Collector Crypt is unavailable." : "",
        tokens.error ? "Grail is unavailable." : "",
      ]
        .filter(Boolean)
        .join(" ") || null,
  };
}
async function subscribe(symbol: string): Promise<Session> {
  const pending = pendingBooks.get(symbol);
  if (pending) return pending;
  const request = openBook(symbol);
  pendingBooks.set(symbol, request);
  try {
    return await request;
  } finally {
    pendingBooks.delete(symbol);
  }
}
async function openBook(symbol: string) {
  const existing = books.get(symbol);
  if (existing) {
    existing.lastAccess = Date.now();
    return existing;
  }
  if (books.size >= 40) throw new Error("Maximum active books reached");
  const contract = await savedContract(symbol);
  if (!contract) throw new Error("Symbol is not in the public active catalog");
  if (!contract.quantityIncrement || !contract.priceIncrement)
    throw new Error("Instrument increments unavailable");
  const client = await geminiClient();
  let book = client.orderBook(symbol);
  const trades = client.websocket.public.trades(symbol, { highWaterMark: 1 });
  const session: Session = {
    book: null,
    latestTrade: null,
    lastAccess: Date.now(),
    close: () => {
      clearInterval(recoveryTimer);
      book.close();
      void trades.close().catch(() => {});
    },
  };
  books.set(symbol, session);
  trades.on("message", (trade) => {
    const time = Math.floor(Number(trade.E) / 1000),
      value = Number(trade.p);
    if (
      trade.s === symbol &&
      Number.isSafeInteger(time) &&
      time > 0 &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1 &&
      (!session.latestTrade || time >= session.latestTrade.time)
    ) {
      session.latestTrade = { time, value };
    }
  });
  // Historical candles also refresh after reconnect; the chart never fabricates missed ticks.
  void trades.ready.catch(() => {});
  let awaitingSnapshotSince = Date.now();
  let recoveryAttempts = 0;
  const onUpdate = (lob: typeof book) => {
    const snapshot = lob.snapshot();
    session.book = {
      symbol,
      bids: snapshot.bids.map((l) => ({ price: l.price, quantity: l.qty })),
      asks: snapshot.asks.map((l) => ({ price: l.price, quantity: l.qty })),
      updatedAt: new Date().toISOString(),
      stale: false,
      source: "gemini",
      quantityIncrement: contract.quantityIncrement!,
      priceIncrement: contract.priceIncrement!,
      quantityMinimum: contract.quantityMinimum,
      priceMinimum: contract.priceMinimum,
      quoteAssetPrecision: contract.quoteAssetPrecision,
    };
    awaitingSnapshotSince = 0;
    recoveryAttempts = 0;
  };
  const stale = () => {
    if (session.book) session.book = { ...session.book, stale: true };
    if (!awaitingSnapshotSince) awaitingSnapshotSince = Date.now();
  };
  const listen = () => {
    book.on("update", onUpdate);
    book.on("resync", stale);
    book.on("error", stale);
  };
  listen();
  // SDK reconnects transport failures; also recover subscriptions that never
  // deliver an initial/resync snapshot. A quiet, healthy book never times out.
  const recoveryTimer = setInterval(() => {
    const timeout = Math.min(60000, 20000 * 2 ** recoveryAttempts);
    if (!awaitingSnapshotSince || Date.now() - awaitingSnapshotSince < timeout)
      return;
    book.close();
    book = client.orderBook(symbol);
    awaitingSnapshotSince = Date.now();
    recoveryAttempts = Math.min(3, recoveryAttempts + 1);
    listen();
    console.warn("Gemini book snapshot timeout; resubscribed", symbol);
  }, 5000);
  return session;
}
setInterval(() => {
  for (const [symbol, session] of books)
    if (Date.now() - session.lastAccess > 90000) {
      session.close();
      books.delete(symbol);
    }
}, 30000);
setInterval(async () => {
  if (!process.env.DATABASE_URL) return;
  for (const session of books.values()) {
    if (!session.book || session.book.stale) continue;
    try {
      await getDb()
        .insert(marketSnapshots)
        .values({ symbol: session.book.symbol, data: session.book });
    } catch {
      console.warn("Snapshot persistence unavailable");
    }
  }
}, 60000);
let valuationBusy = false,
  webhookBusy = false;
setInterval(async () => {
  if (valuationBusy) return;
  valuationBusy = true;
  try {
    await processValuationJob();
  } catch {
    console.warn("Valuation job unavailable");
  } finally {
    valuationBusy = false;
  }
}, 15000);
setInterval(async () => {
  if (
    !process.env.CARD_HEDGE_API_KEY ||
    process.env.ENABLE_PUBLIC_FMV !== "true"
  )
    return;
  try {
    await recoverValuationJobs();
    const cards = await listCards();
    await cacheCardIdentities([DEMO_REPLAY_CARD, ...cards]);
    await enqueueValuations([DEMO_REPLAY_CARD, ...cards]);
  } catch {
    console.warn("Valuation queue unavailable");
  }
}, 60000);
setInterval(async () => {
  if (webhookBusy) return;
  webhookBusy = true;
  try {
    await processWebhookDelivery();
  } catch {
    console.warn("Webhook reconciliation unavailable");
  } finally {
    webhookBusy = false;
  }
}, 5000);

let demoSettlementBusy = false;
setInterval(async () => {
  if (demoSettlementBusy || !process.env.DATABASE_URL) return;
  demoSettlementBusy = true;
  try {
    await (await import("@collectible/integrations")).reconcileDemoPositions();
  } catch {
    console.warn("Demo settlement recovery unavailable");
  } finally {
    demoSettlementBusy = false;
  }
}, 60000);
startMarketRefresh();
const server = Bun.serve({
  port: Number(process.env.PORT ?? 4001),
  hostname: "0.0.0.0",
  idleTimeout: 60,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health")
      return Response.json({
        status: "ok",
        service: "worker",
        activeBooks: books.size,
        mode: process.env.DEMO_MODE ?? "simulated",
      });
    if (url.pathname === "/market") {
      const id = url.searchParams.get("id") ?? "";
      if (!/^[A-Za-z0-9_-]{1,150}$/.test(id))
        return new Response("Invalid market identifier", { status: 400 });
      return Response.json(await savedMarket(id));
    }
    if (url.pathname === "/grail-reward") {
      const chain = Number(url.searchParams.get("chain")),
        address = url.searchParams.get("address") ?? "";
      if (
        !Number.isSafeInteger(chain) ||
        chain <= 0 ||
        !/^0x[a-fA-F0-9]{40}$/.test(address)
      )
        return new Response("Invalid token", { status: 400 });
      return Response.json(
        await providerRead(() => getGrailRewardDetails(chain, address), null),
      );
    }
    if (url.pathname === "/history") {
      const symbol = url.searchParams.get("symbol") ?? "",
        range = url.searchParams.get("range") ?? "ALL";
      if (
        !/^GEMI-[A-Z0-9-]{1,115}$/.test(symbol) ||
        !["1D", "1W", "1M", "ALL"].includes(range)
      )
        return new Response("Invalid history request", { status: 400 });
      return Response.json(
        await providerRead(async () => {
          // Public history remains available after a contract leaves the active
          // catalog. getPriceHistory validates the fixed-origin GEMI symbol.
          return cached(`gemini:history:v2:${symbol}:${range}`, 30000, () =>
            getPriceHistory(symbol, range as ChartRange),
          );
        }, null),
      );
    }
    if (url.pathname === "/markets") {
      const result = await savedMarkets();
      const search = (url.searchParams.get("search") ?? "")
        .slice(0, 100)
        .trim()
        .toLowerCase();
      const category = (url.searchParams.get("category") ?? "").slice(0, 50);
      return Response.json({
        ...result,
        // Prediction discovery must not wait on a separate collectible provider.
        // A sports event may have no matching reward; never invent a related player.
        ...(search
          ? await searchCatalog(search, category, result)
          : {
              data: discoveryMarkets(result.data)
                .map(marketPreview)
                .filter((m) => !category || m.category === category),
            }),
      });
    }
    if (url.pathname === "/rewards" || url.pathname === "/cards") {
      const inventory = await rewardInventory(knownMarkets());
      const cards = inventory.cards;
      return Response.json({
        data:
          url.pathname === "/cards"
            ? cards
            : {
                cards,
                tokens: inventory.tokens,
                replayCard: inventory.replayCard,
              },
        source:
          inventory.error && !cards.length && !inventory.tokens.length
            ? "unavailable"
            : "live",
        observedAt: new Date().toISOString(),
        error: inventory.error,
      });
    }
    if (url.pathname === "/packs")
      return Response.json(await providerRead(listPacks, []));
    if (url.pathname === "/book") {
      try {
        const session = await subscribe(url.searchParams.get("symbol") ?? "");
        return Response.json({
          book: session.book,
          observedAt: new Date().toISOString(),
          error: session.book ? null : "Waiting for Gemini book snapshot",
        });
      } catch {
        return Response.json(
          {
            book: null,
            error: "Book unavailable. Check symbol and provider connection.",
          },
          { status: 503 },
        );
      }
    }
    if (url.pathname === "/events") {
      let timer: ReturnType<typeof setInterval> | undefined;
      const symbol = url.searchParams.get("symbol") ?? "";
      let session: Session;
      try {
        session = await subscribe(symbol);
      } catch {
        return new Response("Book unavailable", { status: 503 });
      }
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = () => {
            session.lastAccess = Date.now();
            try {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ book: session.book, latestTrade: session.latestTrade, error: session.book ? null : "Waiting for Gemini snapshot" })}\n\n`,
                ),
              );
            } catch {
              if (timer) clearInterval(timer);
            }
          };
          send();
          timer = setInterval(send, 1000);
          request.signal.addEventListener(
            "abort",
            () => {
              if (timer) clearInterval(timer);
              try {
                controller.close();
              } catch {}
            },
            { once: true },
          );
        },
        cancel() {
          if (timer) clearInterval(timer);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }
    return new Response("Not found", { status: 404 });
  },
});
console.log(
  `Collectible Markets worker listening on ${server.port}; no financial jobs enabled`,
);
process.on("SIGTERM", () => {
  for (const session of books.values()) session.close();
  server.stop();
  process.exit(0);
});
