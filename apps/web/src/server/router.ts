import { initTRPC } from "@trpc/server";
import { z } from "zod";
import type {
  Market,
  GrailToken,
  GrailRewardDetails,
  Listing,
  Pack,
  ProviderResult,
  PriceHistory,
} from "@collectible/domain";
const t = initTRPC.create();
export async function workerRead<T>(path: string): Promise<T> {
  const origin = process.env.WORKER_URL ?? "http://localhost:4001";
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(
      /^(\/markets|\/rewards|\/cards)/.test(path) ? 90000 : 20000,
    ),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Data worker unavailable");
  return response.json() as Promise<T>;
}
async function safe<T>(path: string, empty: T): Promise<ProviderResult<T>> {
  try {
    return await workerRead<ProviderResult<T>>(path);
  } catch {
    return {
      data: empty,
      source: "unavailable",
      observedAt: new Date().toISOString(),
      error: "Data worker is unavailable. Please retry.",
    };
  }
}
export const appRouter = t.router({
  grailReward: t.procedure
    .input(
      z.object({
        chain: z.number().int().positive(),
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      }),
    )
    .query(({ input }) =>
      safe<GrailRewardDetails | null>(
        `/grail-reward?chain=${input.chain}&address=${input.address}`,
        null,
      ),
    ),
  markets: t.procedure
    .input(
      z
        .object({
          search: z.string().max(100).default(""),
          category: z.string().max(50).optional(),
        })
        .default({ search: "" }),
    )
    .query(({ input }) =>
      safe<Market[]>(
        `/markets?search=${encodeURIComponent(input.search)}&category=${encodeURIComponent(input.category ?? "")}`,
        [],
      ),
    ),
  market: t.procedure
    .input(z.object({ id: z.string().max(150) }))
    .query(({ input }) =>
      safe<Market | null>(`/market?id=${encodeURIComponent(input.id)}`, null),
    ),
  history: t.procedure
    .input(
      z.object({
        symbol: z.string().regex(/^GEMI-[A-Z0-9-]{1,115}$/),
        range: z.enum(["1D", "1W", "1M", "ALL"]),
      }),
    )
    .query(({ input }) =>
      safe<PriceHistory | null>(
        `/history?symbol=${encodeURIComponent(input.symbol)}&range=${input.range}`,
        null,
      ),
    ),
  cards: t.procedure
    .input(
      z
        .object({ search: z.string().max(100).default("") })
        .default({ search: "" }),
    )
    .query(({ input }) =>
      safe<Listing[]>(`/cards?search=${encodeURIComponent(input.search)}`, []),
    ),
  rewards: t.procedure.query(() =>
    safe<{ cards: Listing[]; tokens: GrailToken[]; replayCard?: Listing }>(
      "/rewards",
      {
        cards: [],
        tokens: [],
      },
    ),
  ),
  packs: t.procedure.query(() => safe<Pack[]>("/packs", [])),
  status: t.procedure.query(() => ({
    mode: process.env.DEMO_MODE ?? "simulated",
    solanaNetwork: process.env.SOLANA_NETWORK ?? "devnet",
    privyConfigured: !!process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    liveTrading: false,
    purchases: false,
    funding: false,
  })),
});
export type AppRouter = typeof appRouter;
