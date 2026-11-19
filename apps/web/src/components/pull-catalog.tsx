"use client";

import { api } from "@/lib/trpc";
import {
  activeMarket,
  availablePullTeams,
  matchesPullTheme,
  marketMatches,
  pullSearchQuery,
  sortMarkets,
  type Market,
  type ProviderResult,
  type PullTheme,
} from "@collectible/domain";
import { useEffect, useMemo, useState } from "react";
import { useMarketClock } from "@/lib/use-market-clock";
import { retainMarketSnapshot } from "@/lib/market-snapshot";

export function usePullCatalog(theme: PullTheme, search = "") {
  const text = pullSearchQuery(theme, search);
  const [query, setQuery] = useState(text);
  const now = useMarketClock();
  const base = api.markets.useQuery(
    { search: "", status: "active" },
    {
      refetchInterval: (q) => (q.state.data?.refreshing ? 2000 : 15000),
      structuralSharing: (previous, incoming) =>
        retainMarketSnapshot(
          previous as ProviderResult<Market[]> | undefined,
          incoming as ProviderResult<Market[]>,
        ),
    },
  );
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
  const baseAvailable =
    base.data?.source === "live" || base.data?.source === "cache";
  const searching =
    query !== text ||
    (!available &&
      !baseAvailable &&
      (result.isPending || base.isPending || !!result.data?.refreshing));
  const delayed = available
    ? !!(result.data?.stale || result.data?.error || result.error)
    : baseAvailable && !!(base.data?.stale || base.data?.error || base.error);
  const markets = useMemo(
    () =>
      sortMarkets(
        [
          ...new Map(
            [
              ...(baseAvailable ? (base.data?.data ?? []) : []),
              ...(available ? (result.data?.data ?? []) : []),
            ].map((market) => [market.id, market]),
          ).values(),
        ].filter(
          (market) =>
            activeMarket(market) &&
            !!market.ticker &&
            (market.outcomeCount ?? market.contracts.length) > 0 &&
            (!market.closesAt || Date.parse(market.closesAt) > now) &&
            matchesPullTheme(market, theme) &&
            (!search || marketMatches(market, search)),
        ),
        "volume",
      ),
    [available, baseAvailable, base.data, result.data, theme, search, now],
  );
  return {
    ...result,
    markets,
    teams: useMemo(
      () =>
        availablePullTeams(
          (baseAvailable ? (base.data?.data ?? []) : []).filter(
            (market) =>
              activeMarket(market) &&
              (!market.closesAt || Date.parse(market.closesAt) > now),
          ),
        ),
      [baseAvailable, base.data, now],
    ),
    searching,
    delayed,
    unavailable: !searching && !available && !baseAvailable,
    refetch: () => Promise.all([result.refetch(), base.refetch()]),
  };
}
