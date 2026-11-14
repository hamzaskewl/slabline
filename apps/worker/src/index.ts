import {
  geminiClient,
  listMarkets,
  listCards,
  listGrailTokens,
  listPacks,
  cached,
  providerRead,
  attachCachedValuations,
  enqueueValuations,
  processValuationJob,
  recoverValuationJobs,
  getMarketByTicker,
  getPriceHistory,
} from "@collectible/integrations";
import {
  marketPreview,
  rewardCategories,
  sportsForMarket,
  type Book,
  type Market,
  type PricePoint,
  type ChartRange,
} from "@collectible/domain";
import {
  getDb,
  marketSnapshots,
  markets as marketTable,
  contracts as contractTable,
  sql,
  eq,
} from "@collectible/db";
import { processWebhookDelivery } from "./reconciliation";

type Session = {
  book: Book | null;
  latestTrade: PricePoint | null;
  lastAccess: number;
  close: () => void;
};
const books = new Map<string, Session>();
const pendingBooks = new Map<string, Promise<Session>>();
let knownMarkets: Market[] = [];
const allContracts = (items: Market[]): Market["contracts"] =>
  items.flatMap((m) => [...m.contracts, ...allContracts(m.children)]);
let metadataSavedAt = 0;
async function markets(search = "", category = "") {
  const data = await cached(
    "gemini:markets:v6:all-active-categories",
    60000,
    () => listMarkets(),
  );
  knownMarkets = data;
  if (process.env.DATABASE_URL && Date.now() - metadataSavedAt > 60000) {
    const flatten = (items: Market[]): Market[] =>
      items.flatMap((m) => [m, ...flatten(m.children)]);
    const rows = [...new Map(flatten(data).map((m) => [m.id, m])).values()];
    try {
      if (rows.length) {
        for (let start = 0; start < rows.length; start += 500)
          await getDb()
            .insert(marketTable)
            .values(
              rows.slice(start, start + 500).map((m) => ({
                id: m.id,
                provider: "gemini",
                category: m.category,
                status: m.status,
                data: m,
              })),
            )
            .onConflictDoUpdate({
              target: marketTable.id,
              set: {
                data: sql`excluded.data`,
                status: sql`excluded.status`,
                updatedAt: new Date(),
              },
            });
        const contracts = [
          ...new Map(
            rows
              .flatMap((m) =>
                m.contracts.map((c) => ({
                  symbol: c.symbol,
                  marketId: m.id,
                  data: c,
                })),
              )
              .map((c) => [c.symbol, c]),
          ).values(),
        ];
        for (let start = 0; start < contracts.length; start += 500)
          await getDb()
            .insert(contractTable)
            .values(contracts.slice(start, start + 500))
            .onConflictDoUpdate({
              target: contractTable.symbol,
              set: { data: sql`excluded.data` },
            });
        metadataSavedAt = Date.now();
      }
    } catch {
      console.warn("Market metadata persistence unavailable");
    }
  }
  const searchText = search.trim().toLowerCase();
  const searchable = (m: Market): string =>
    [m.title, ...m.contracts.map((c) => c.label), ...m.children.map(searchable)]
      .join(" ")
      .toLowerCase();
  return data.filter(
    (m) =>
      (!category || m.category === category) &&
      (!searchText || searchable(m).includes(searchText)),
  );
}
async function rewardInventory(data: Market[]) {
  const [cards, tokens] = await Promise.all([
    providerRead(() => listCards("", rewardCategories(data)), []),
    providerRead(listGrailTokens, []),
  ]);
  return {
    cards: cards.data,
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
  if (!knownMarkets.length) await markets();
  const contract = allContracts(knownMarkets).find((c) => c.symbol === symbol);
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
    await enqueueValuations(await listCards());
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
    if (url.pathname === "/market")
      return Response.json(
        await providerRead(async () => {
          const id = url.searchParams.get("id") ?? "";
          if (!/^[A-Za-z0-9_-]{1,150}$/.test(id))
            throw new Error("Invalid market identifier");
          const existing = knownMarkets.find(
            (m) => m.id === id || m.ticker === id,
          );
          if (existing && /^\d+$/.test(id)) return existing;
          let market: Market | null = null;
          if (/^\d+$/.test(id) && process.env.DATABASE_URL) {
            const [row] = await getDb()
              .select()
              .from(marketTable)
              .where(eq(marketTable.id, id))
              .limit(1);
            market = (row?.data as Market | undefined) ?? null;
          } else if (!/^\d+$/.test(id)) {
            market = await cached(`gemini:event:v2:${id}`, 30000, () =>
              getMarketByTicker(id),
            );
          }
          if (market)
            knownMarkets = [
              ...new Map(
                [...knownMarkets, market].map((m) => [m.id, m]),
              ).values(),
            ];
          return market;
        }, null),
      );
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
      const result = await providerRead(
        () =>
          markets(
            url.searchParams.get("search")?.slice(0, 100) ?? "",
            url.searchParams.get("category")?.slice(0, 50) ?? "",
          ),
        [],
      );
      return Response.json({
        ...result,
        // Prediction discovery must not wait on a separate collectible provider.
        // A sports event may have no matching reward; never invent a related player.
        data: result.data
          .filter(
            (m) => m.category === "Sports" || sportsForMarket(m).length > 0,
          )
          .map(marketPreview),
      });
    }
    if (url.pathname === "/rewards" || url.pathname === "/cards") {
      const inventory = await rewardInventory(knownMarkets);
      const cards = inventory.cards;
      return Response.json({
        data:
          url.pathname === "/cards"
            ? cards
            : {
                cards,
                tokens: inventory.tokens,
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
