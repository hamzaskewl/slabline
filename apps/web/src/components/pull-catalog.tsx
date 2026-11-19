"use client";

import { api } from "@/lib/trpc";
import {
  activeMarket,
  type Market,
  type ProviderResult,
  type PullTheme,
} from "@collectible/domain";
import { useEffect, useMemo, useState } from "react";
import { useMarketClock } from "@/lib/use-market-clock";
import { retainMarketSnapshot } from "@/lib/market-snapshot";

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
    {
      refetchInterval: (q) => (q.state.data?.refreshing ? 2000 : 15000),
      structuralSharing: (previous, incoming) =>
        retainMarketSnapshot(
          previous as ProviderResult<Market[]> | undefined,
          incoming as ProviderResult<Market[]>,
        ),
    },
  );
  const available =
    result.data?.source === "live" || result.data?.source === "cache";
  const searching =
    query !== text ||
    (!available && (result.isPending || !!result.data?.refreshing));
  const delayed =
    available && !!(result.data?.stale || result.data?.error || result.error);
  const markets = useMemo(
    () =>
      (available ? (result.data?.data ?? []) : []).filter(
        (market) =>
          activeMarket(market) &&
          !!market.ticker &&
          (market.outcomeCount ?? market.contracts.length) > 0 &&
          (!market.closesAt || Date.parse(market.closesAt) > now) &&
          matchesTheme(market, theme),
      ),
    [available, result.data, theme, now],
  );
  return {
    ...result,
    markets,
    searching,
    delayed,
    unavailable: !searching && !available,
  };
}
