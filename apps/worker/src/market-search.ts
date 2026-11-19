import { cached, listMarkets } from "@collectible/integrations";
import {
  discoveryMarkets,
  marketMatches,
  marketStatusMatches,
  marketPreview,
  normalizeMarketSearch,
  type Market,
  type ProviderResult,
  type MarketStatusFilter,
} from "@collectible/domain";

export async function searchCatalog(
  search: string,
  category: string,
  snapshot: ProviderResult<Market[]>,
  status: MarketStatusFilter = "active",
) {
  const local = snapshot.data.filter((m) => marketMatches(m, search));
  try {
    const remote = await cached(
      `gemini:search:v3:${status}:${search}`,
      30000,
      async () => ({
        data: await listMarkets(
          normalizeMarketSearch(search),
          undefined,
          status,
        ),
        observedAt: new Date().toISOString(),
      }),
    );
    return {
      source: "cache" as const,
      observedAt: remote.observedAt,
      refreshing: false,
      stale: false,
      error: null,
      data: discoveryMarkets([...local, ...remote.data])
        .filter((m) => marketStatusMatches(m, status))
        .map(marketPreview)
        .filter((m) => !category || m.category === category),
    };
  } catch {
    return {
      ...snapshot,
      refreshing: false,
      stale: true,
      error:
        "Gemini search is unavailable. Showing matches from the saved catalog; retry to search all markets.",
      data: discoveryMarkets(local)
        .filter((m) => marketStatusMatches(m, status))
        .map(marketPreview)
        .filter((m) => !category || m.category === category),
    };
  }
}
