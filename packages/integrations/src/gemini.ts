import { createClient } from "@gemini-markets/sdk/server";
import type { Market } from "@collectible/domain";
import { z } from "zod";

const contract = z.object({
  instrumentSymbol: z.string(),
  label: z.string().optional(),
  status: z.string().optional(),
  quantityIncrement: z.string().nullable().optional(),
  priceIncrement: z.string().nullable().optional(),
  quantityMinimum: z.string().nullable().optional(),
  priceMinimum: z.string().nullable().optional(),
  quoteAssetPrecision: z.number().nullable().optional(),
  prices: z
    .object({
      lastTradePrice: z.string().optional(),
      bestAsk: z.string().optional(),
    })
    .optional(),
});
type RawEvent = {
  id: string;
  ticker?: string;
  title: string;
  category?: string;
  status?: string;
  imageUrl?: string | null;
  contracts?: z.infer<typeof contract>[];
  events?: RawEvent[];
  description?: string | null;
  expiryDate?: string | null;
};
const event: z.ZodType<RawEvent> = z.lazy(() =>
  z.object({
    id: z.string(),
    ticker: z.string().optional(),
    title: z.string(),
    category: z.string().optional(),
    status: z.string().optional(),
    imageUrl: z.string().nullable().optional(),
    contracts: z.array(contract).optional(),
    events: z.array(event).optional(),
    description: z.string().nullable().optional(),
    expiryDate: z.string().nullable().optional(),
  }),
);
export function normalizeEvent(raw: RawEvent): Market {
  return {
    id: raw.id,
    ticker: raw.ticker,
    title: raw.title,
    category: raw.category ?? "Other",
    status: raw.status ?? "unknown",
    imageUrl: safeImage(raw.imageUrl),
    description: raw.description ?? "",
    closesAt: raw.expiryDate ?? null,
    contracts: (raw.contracts ?? []).map((c) => ({
      symbol: c.instrumentSymbol,
      label: c.label ?? c.instrumentSymbol,
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
  const response = await client.predictions.listEvents({
    status: ["active"],
    limit: 100,
    ...(search ? { search } : {}),
    ...(category ? { category: [category] } : {}),
  });
  return z
    .object({ data: z.array(event) })
    .parse(response)
    .data.map(normalizeEvent);
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
