import { createClient } from "@gemini-markets/sdk/server";
import {
  historyIntervals,
  normalizePricePoints,
  type ChartRange,
  type PriceHistory,
  type Market,
} from "@collectible/domain";
import { z } from "zod";

const contract = z.object({
  instrumentSymbol: z.string(),
  label: z.string().optional(),
  color: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  status: z.string().optional(),
  quantityIncrement: z.string().nullable().optional(),
  priceIncrement: z.string().nullable().optional(),
  quantityMinimum: z.string().nullable().optional(),
  priceMinimum: z.string().nullable().optional(),
  quoteAssetPrecision: z.number().nullable().optional(),
  prices: z
    .object({
      lastTradePrice: z.string().nullable().optional(),
      bestAsk: z.string().nullable().optional(),
      buy: z
        .object({ yes: z.string().nullish(), no: z.string().nullish() })
        .nullish(),
    })
    .nullable()
    .optional(),
});
type RawEvent = {
  id: string;
  ticker?: string;
  title: string;
  category?: string;
  volume?: string | number | null;
  subcategory?: { name?: string | null } | null;
  status?: string;
  imageUrl?: string | null;
  contracts?: z.infer<typeof contract>[];
  events?: RawEvent[];
  description?: string | null;
  expiryDate?: string | null;
  startTime?: string | null;
};
const event: z.ZodType<RawEvent> = z.lazy(() =>
  z.object({
    id: z.string(),
    ticker: z.string().optional(),
    title: z.string(),
    category: z.string().optional(),
    volume: z.union([z.string(), z.number()]).nullish(),
    subcategory: z.object({ name: z.string().nullish() }).nullish(),
    status: z.string().optional(),
    imageUrl: z.string().nullable().optional(),
    contracts: z.array(contract).optional(),
    events: z.array(event).optional(),
    description: z.string().nullable().optional(),
    expiryDate: z.string().nullable().optional(),
    startTime: z.string().nullish(),
  }),
);
export function normalizeEvent(raw: RawEvent): Market {
  return {
    id: raw.id,
    ticker: raw.ticker,
    title: raw.title,
    category: raw.category ?? "Other",
    volume:
      raw.volume != null && /^\d+(?:\.\d+)?$/.test(String(raw.volume))
        ? String(raw.volume)
        : null,
    subcategory: raw.subcategory?.name ?? null,
    status: raw.status ?? "unknown",
    imageUrl: safeImage(raw.imageUrl),
    description: raw.description ?? "",
    closesAt: raw.expiryDate ?? null,
    startsAt: raw.startTime ?? null,
    contracts: (raw.contracts ?? []).map((c) => ({
      symbol: c.instrumentSymbol,
      label: c.label ?? c.instrumentSymbol,
      color: c.color && /^#[\da-f]{6}$/i.test(c.color) ? c.color : null,
      imageUrl: safeImage(c.imageUrl),
      buyYes: c.prices?.buy?.yes ?? null,
      buyNo: c.prices?.buy?.no ?? null,
      status: c.status ?? "unknown",
      lastPrice: c.prices?.lastTradePrice ?? c.prices?.bestAsk ?? null,
      quantityIncrement: c.quantityIncrement ?? null,
      priceIncrement: c.priceIncrement ?? null,
      quantityMinimum: c.quantityMinimum ?? undefined,
      priceMinimum: c.priceMinimum ?? undefined,
      quoteAssetPrecision: c.quoteAssetPrecision ?? undefined,
    })),
    children: (raw.events ?? []).map(normalizeEvent),
  };
}
let clientPromise: ReturnType<typeof createClient> | undefined;
export function geminiClient() {
  return (clientPromise ??= createClient({
    env:
      process.env.GEMINI_ENVIRONMENT === "sandbox" ? "sandbox" : "production",
    timeoutMs: 12000,
    maxRetries: 2,
    webSocketReconnect: { unlimited: true },
    webSocketLiveness: { intervalMs: 10000, timeoutMs: 10000 },
  }));
}
export async function listMarkets(
  search?: string,
  category?: string,
): Promise<Market[]> {
  const client = await geminiClient();
  // Unfiltered reads currently omit older active categories such as Business.
  // Page every provider category and deduplicate overlapping category views.
  const categories = category
    ? [category]
    : z
        .object({ categories: z.array(z.string()) })
        .parse(await client.predictions.getCategories({ status: ["active"] }))
        .categories;
  const groups: Market[][] = [];
  const queue = (categories.length ? categories : [undefined]).map(
    (category, index) => ({ category, index }),
  );
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) {
        const next = queue.shift()!;
        groups[next.index] = await collectMarketPages((offset, limit) =>
          client.predictions.listEvents({
            status: ["active"],
            limit,
            offset,
            ...(search ? { search } : {}),
            ...(next.category ? { category: [next.category] } : {}),
          }),
        );
      }
    }),
  );
  return [...new Map(groups.flat().map((m) => [m.id, m])).values()];
}

// Never publish the first page as the complete catalog. Failure of any page fails the read.
export async function collectMarketPages(
  load: (offset: number, limit: number) => PromiseLike<unknown>,
): Promise<Market[]> {
  const result = new Map<string, Market>();
  const pageSchema = z.object({
    data: z.array(event),
    pagination: z.object({ total: z.number().int().nonnegative() }),
  });
  // A 500-event sports page can exceed the SDK's 16 MiB safety limit.
  // Use bounded pages, with no cap on the number of pages.
  let limit = 100;
  for (let offset = 0; ;) {
    let raw: unknown;
    try {
      raw = await load(offset, limit);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.name !== "RequestTimeoutError" ||
        limit <= 25
      )
        throw error;
      limit = Math.floor(limit / 2);
      continue;
    }
    const page = pageSchema.parse(raw);
    for (const raw of page.data) result.set(raw.id, normalizeEvent(raw));
    if (offset + page.data.length >= page.pagination.total) break;
    if (page.data.length < limit)
      throw new Error("Incomplete Gemini catalog page");
    offset += page.data.length;
  }
  return [...result.values()];
}

const candleSchema = z.array(
  z.tuple([
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
  ]),
);
export function normalizeCandles(
  raw: unknown,
  symbol: string,
  range: ChartRange,
): PriceHistory {
  const candles = candleSchema.parse(raw);
  return {
    symbol,
    range,
    intervalSeconds: historyIntervals[range],
    points: normalizePricePoints(
      candles.map((c) => ({ time: Math.floor(c[0] / 1000), value: c[4] })),
    ),
  };
}

export async function getPriceHistory(
  symbol: string,
  range: ChartRange,
): Promise<PriceHistory> {
  if (!/^GEMI-[A-Z0-9-]{1,115}$/.test(symbol))
    throw new Error("Invalid prediction symbol");
  const client = await geminiClient();
  return readPriceHistory(symbol, range, async (frame) => {
    if (frame === "1day") {
      // SDK 0.1.1 types expose `1d`, which Gemini rejects (400). The documented,
      // verified daily wire value is `1day`: https://developer.gemini.com/trading/rest-api/market-data/list-candles
      const origin =
        process.env.GEMINI_ENVIRONMENT === "sandbox"
          ? "https://api.sandbox.gemini.com"
          : "https://api.gemini.com";
      const response = await fetch(
        `${origin}/v2/candles/${encodeURIComponent(symbol)}/1day`,
        { signal: AbortSignal.timeout(12000) },
      );
      if (!response.ok) throw new CandleRequestError(response.status);
      return response.json();
    } else {
      return client.marketData.listCandles({
        symbol,
        time_frame: frame,
      });
    }
  });
}
export class CandleRequestError extends Error {
  constructor(public statusCode: number) {
    super(`Gemini history unavailable (${statusCode})`);
  }
}
type CandleFrame = "1day" | "1m" | "5m" | "30m";
export async function readPriceHistory(
  symbol: string,
  range: ChartRange,
  load: (frame: CandleFrame) => PromiseLike<unknown>,
  now = Date.now(),
): Promise<PriceHistory> {
  let frame: CandleFrame = (
    { ALL: "1day", "1D": "1m", "1W": "5m", "1M": "30m" } as const
  )[range];
  let raw: unknown;
  try {
    raw = await load(frame);
  } catch (error) {
    // Newly opened contracts can have minute candles but no daily candle yet.
    if (
      frame !== "1day" ||
      !(error instanceof CandleRequestError) ||
      ![400, 404].includes(error.statusCode)
    )
      throw error;
    frame = "1m";
    raw = await load(frame);
  }
  let history = normalizeCandles(raw, symbol, range);
  if (!history.points.length && frame !== "1m") {
    frame = "1m";
    history = normalizeCandles(await load(frame), symbol, range);
  }
  return {
    ...history,
    points:
      range === "ALL"
        ? history.points
        : history.points.filter(
            (p) =>
              p.time >=
              Math.floor(now / 1000) -
                { "1D": 1, "1W": 7, "1M": 30 }[range] * 86400,
          ),
    intervalSeconds: { "1day": 86400, "1m": 60, "5m": 300, "30m": 1800 }[frame],
  };
}
export async function getMarketByTicker(ticker: string): Promise<Market> {
  const client = await geminiClient();
  return normalizeEvent(
    event.parse(await client.predictions.getEvent({ eventTicker: ticker })),
  );
}
export function safeImage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const allowed = [
      "assets.gemini.com",
      "arweave.net",
      "d1xpxki1g4htqu.cloudfront.net",
      "ipfs.io",
      "gateway.pinata.cloud",
      "images.phygitals.com",
      "cdn.phygitals.com",
      "api.phygitals.com",
    ];
    return url.protocol === "https:" && allowed.some((h) => url.hostname === h)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
