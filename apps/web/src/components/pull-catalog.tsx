"use client";

import { api } from "@/lib/trpc";
import { activeMarket, type Market, type PullTheme } from "@collectible/domain";
import { useEffect, useMemo, useState } from "react";
import { useMarketClock } from "@/lib/use-market-clock";

function matchesTheme(market: Market, theme: PullTheme): boolean {
  if (theme.kind === "all") return true;
  const text = theme.label.trim().toLowerCase();
  if (theme.kind === "team")
    return (market.teams ?? []).some((team) =>
      team.label.toLowerCase().includes(text),
    );
  return market.sportsMarket?.subject?.toLowerCase().includes(text) ?? false;
}

export function usePullCatalog(theme: PullTheme, search = "") {
  const text = (theme.kind === "all" ? search : theme.label).trim();
  const [query, setQuery] = useState(text);
  const now = useMarketClock();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const result = api.markets.useQuery(
    { search: query, status: "active" },
    { refetchInterval: (q) => (q.state.data?.refreshing ? 2000 : 15000) },
  );
  const markets = useMemo(
    () =>
      (result.data?.source === "live" || result.data?.source === "cache"
        ? result.data.data
        : []
      ).filter(
        (market) =>
          activeMarket(market) &&
          !!market.ticker &&
          (market.outcomeCount ?? market.contracts.length) > 0 &&
          (!market.closesAt || Date.parse(market.closesAt) > now) &&
          matchesTheme(market, theme),
      ),
    [result.data, theme, now],
  );
  return {
    ...result,
    markets,
    searching: result.isPending || query !== text || !!result.data?.refreshing,
  };
}
