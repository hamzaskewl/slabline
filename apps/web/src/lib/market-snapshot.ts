import type { ProviderResult } from "@collectible/domain";

/** Preserve public browsing data on transport failure; never applied to books/accounts. */
export function retainMarketSnapshot<T>(
  previous: ProviderResult<T> | undefined,
  incoming: ProviderResult<T>,
): ProviderResult<T> {
  if (
    incoming.source === "unavailable" &&
    previous &&
    previous.source !== "unavailable"
  )
    return {
      ...previous,
      source: "cache",
      stale: true,
      refreshing: incoming.refreshing,
      error: incoming.error ?? "Market updates are delayed.",
    };
  return incoming;
}
