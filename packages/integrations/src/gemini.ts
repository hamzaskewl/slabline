import { ApiError, SdkError, createClient } from "@gemini-markets/sdk/server";
import {
  historyIntervals,
  normalizePricePoints,
  type ChartRange,
  type PriceHistory,
  type Market,
  marketTeams,
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
  liquidity?: string | null;
  createdAt?: string | null;
  subcategory?: { name?: string | null } | null;
  status?: string;
  imageUrl?: string | null;
  contracts?: z.infer<typeof contract>[];
  events?: RawEvent[];
  description?: string | null;
  expiryDate?: string | null;
  startTime?: string | null;
  sportsMarket?: { type: string; subject?: string; sport?: string } | null;
};
const event: z.ZodType<RawEvent> = z.lazy(() =>
  z.object({
    id: z.string(),
    ticker: z.string().optional(),
    title: z.string(),
    category: z.string().optional(),
    volume: z.union([z.string(), z.number()]).nullish(),
    liquidity: z.string().nullish(),
    createdAt: z.string().nullish(),
    subcategory: z.object({ name: z.string().nullish() }).nullish(),
    status: z.string().optional(),
    imageUrl: z.string().nullable().optional(),
    contracts: z.array(contract).optional(),
    events: z.array(event).optional(),
    description: z.string().nullable().optional(),
    expiryDate: z.string().nullable().optional(),
    startTime: z.string().nullish(),
    sportsMarket: z
      .object({
        type: z.string(),
        subject: z.string().optional(),
        sport: z.string().optional(),
      })
      .nullish(),
  }),
);
export function normalizeEvent(raw: RawEvent): Market {
  const market: Market = {
    id: raw.id,
    ticker: raw.ticker,
    title: raw.title,
    category: raw.category ?? "Other",
    liquidity: raw.liquidity ?? null,
    createdAt: raw.createdAt ?? null,
    volume:
      raw.volume != null && /^\d+(?:\.\d+)?$/.test(String(raw.volume))
        ? String(raw.volume)
        : null,
    subcategory: raw.subcategory?.name ?? null,
    sportsMarket: raw.sportsMarket ?? null,
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
      lastPrice: c.prices?.lastTradePrice ?? null,
      quantityIncrement: c.quantityIncrement ?? null,
      priceIncrement: c.priceIncrement ?? null,
      quantityMinimum: c.quantityMinimum ?? undefined,
      priceMinimum: c.priceMinimum ?? undefined,
      quoteAssetPrecision: c.quoteAssetPrecision ?? undefined,
    })),
    children: (raw.events ?? []).map(normalizeEvent),
  };
  const teams = marketTeams(market);
  if (teams.length) {
    market.teams = teams;
    const inherit = (child: Market) => {
      child.teams = teams;
      child.children.forEach(inherit);
    };
    market.children.forEach(inherit);
  }
  return market;
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
  state: "active" | "resolved" | "all" = "active",
): Promise<Market[]> {
  if (state === "all") {
    const groups = await Promise.all([
      listMarkets(search, category, "active"),
      listMarkets(search, category, "resolved"),
    ]);
    return [...new Map(groups.flat().map((m) => [m.id, m])).values()];
  }
  const client = await geminiClient();
  // Live listEvents rejects invalid despite that enum appearing in the SDK.
  const status: ("active" | "settled")[] =
    state === "resolved" ? ["settled"] : ["active"];
  // Provider title search finds events omitted by the general category feed.
  if (search)
    return collectMarketPages((offset, limit) =>
      client.predictions.listEvents({
        status,
        search,
        limit,
        offset,
        ...(category ? { category: [category] } : {}),
      }),
    );
  // Unfiltered reads currently omit older active categories such as Business.
  // Page every provider category and deduplicate overlapping category views.
  const categories = category
    ? [category]
    : z
        .object({ categories: z.array(z.string()) })
        .parse(await client.predictions.getCategories({ status })).categories;
  return collectMarketCategories(categories, (category, offset, limit) =>
    client.predictions.listEvents(
      {
        status,
        limit,
        offset,
        ...(category ? { category: [category] } : {}),
      },
      { timeoutMs: limit === 100 ? 12000 : 40000 },
    ),
  );
}
export async function collectMarketCategories(
  categories: string[],
  load: (
    category: string | undefined,
    offset: number,
    limit: number,
  ) => PromiseLike<unknown>,
): Promise<Market[]> {
  const groups: Market[][] = [];
  const queue = (categories.length ? categories : [undefined]).map(
    (category, index) => ({ category, index }),
  );
  const queued = new Set(categories);
  let nextIndex = queue.length;
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) {
        const next = queue.shift()!;
        groups[next.index] = await collectMarketPages((offset, limit) =>
          load(next.category, offset, limit),
        );
        // Gemini's broad Sports view omits older active futures, even after its
        // reported last page. League category views include them (e.g. NFL MVP).
        // Discover league names from provider metadata rather than hardcoding teams.
        const visit = (m: Market) => {
          if (
            m.category === "Sports" &&
            m.subcategory &&
            !queued.has(m.subcategory)
          ) {
            queued.add(m.subcategory);
            queue.push({ category: m.subcategory, index: nextIndex++ });
          }
          m.children.forEach(visit);
        };
        groups[next.index]!.forEach(visit);
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
  // Nested sports events vary in size. Keep the SDK's response limit and
  // shrink an oversized/slow page at the same offset instead of losing the scan.
  let limit = 100;
  for (let offset = 0; ;) {
    let raw: unknown;
    try {
      raw = await load(offset, limit);
    } catch (error) {
      const tooLarge =
        error instanceof SdkError &&
        /^HTTP response exceeded the configured \d+-byte limit$/.test(
          error.message,
        );
      const timedOut =
        error instanceof Error && error.name === "RequestTimeoutError";
      if ((!tooLarge && !timedOut) || limit === 1) throw error;
      limit = Math.max(1, Math.floor(limit / 2));
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
      if (!response.ok) {
        const body = z
          .object({ reason: z.string() })
          .safeParse(await response.json().catch(() => null));
        throw new CandleRequestError(
          response.status,
          body.success ? body.data.reason : undefined,
        );
      }
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
  constructor(
    public statusCode: number,
    public reason?: string,
  ) {
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
  const read = async (interval: CandleFrame) => {
    try {
      return await load(interval);
    } catch (error) {
      // Gemini reports an empty history as HTTP 400 NoDataFound, including
      // through the SDK. Other 4xx, outages and malformed bodies remain errors.
      const status =
        error instanceof ApiError
          ? error.status
          : error instanceof CandleRequestError
            ? error.statusCode
            : null;
      if (
        status === 400 &&
        (error instanceof ApiError || error instanceof CandleRequestError) &&
        error.reason === "NoDataFound"
      )
        return [];
      throw error;
    }
  };
  const raw = await read(frame);
  let history = normalizeCandles(raw, symbol, range);
  if (!history.points.length && frame !== "1m") {
    frame = "1m";
    history = normalizeCandles(await read(frame), symbol, range);
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
      "nft.collectorcrypt.com",
      "nft-dev.collectorcrypt.com",
      "arweave.net",
      "d1xpxki1g4htqu.cloudfront.net",
      "ipfs.io",
      "gateway.pinata.cloud",
      "images.phygitals.com",
      "cdn.phygitals.com",
      "api.phygitals.com",
      "grailxyz-public.s3.us-east-2.amazonaws.com",
      "wildcard-public.s3.us-east-2.amazonaws.com",
    ];
    // Gemini's older team helmets/shoes are served from its Contentful space.
    const geminiContentful =
      url.hostname === "images.ctfassets.net" &&
      url.pathname.startsWith("/jg6lo9a2ukvr/");
    return url.protocol === "https:" &&
      (allowed.some((h) => url.hostname === h) || geminiContentful)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
