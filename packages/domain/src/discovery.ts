import type { Contract, Market } from "./index";

export type MarketSort =
  | "relevance"
  | "trending"
  | "liquidity"
  | "volume"
  | "newest"
  | "closing"
  | "competitive"
  | "name";
export type MarketStatusFilter = "active" | "resolved" | "all";
export function marketStatusMatches(
  m: Market,
  status: MarketStatusFilter,
  now = Date.now(),
) {
  return (
    status === "all" ||
    (status === "resolved"
      ? ["settled", "invalid"].includes(m.status)
      : isCurrentMarket(m, now))
  );
}
const dateValue = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

// Provider "active" can outlast the game. Never infer Live from start time alone.
export function isLiveMarket(m: Market, now = Date.now()): boolean {
  const start = dateValue(m.startsAt);
  // Gemini can retain isLive on days-old games whose settlement expiry was
  // extended. Bound promotion of single games; this never settles a market.
  const game = isSportsGame(m);
  const windowHours =
    m.sportsMarket?.sport === "baseball"
      ? 12
      : m.sportsMarket?.sport === "american_football"
        ? 8
        : 6;
  return (
    m.isLive === true &&
    isOpenMarket(m, now) &&
    (start === null || start <= now) &&
    (!game || (start !== null && now - start < windowHours * 3600000))
  );
}
function isSportsGame(m: Market): boolean {
  return (
    m.category === "Sports" &&
    m.sportsMarket?.type !== "futures" &&
    (!!m.sportsMarket || /\bvs\.?\s/i.test(m.title))
  );
}
function isOpenMarket(m: Market, now: number): boolean {
  const close = dateValue(m.closesAt);
  return (
    m.status === "active" &&
    !m.resolvedAt &&
    (close === null || close > now) &&
    (!m.contracts.length ||
      (m.outcomeCount ?? 0) > m.contracts.length ||
      m.contracts.some((c) => c.status === "active"))
  );
}
export function isCurrentMarket(m: Market, now = Date.now()): boolean {
  if (!isOpenMarket(m, now)) return false;
  const start = dateValue(m.startsAt);
  const game = isSportsGame(m);
  return !game || start === null || start > now || isLiveMarket(m, now);
}
export function isLiveGame(m: Market, now = Date.now()): boolean {
  return isSportsGame(m) && isLiveMarket(m, now);
}
export function featuredMarkets(markets: Market[], now = Date.now()): Market[] {
  return sortMarkets(
    markets.filter(
      (m) =>
        isCurrentMarket(m, now) &&
        marketTeams(m).length === 2 &&
        !m.title.includes(":") &&
        (isLiveGame(m, now) || (dateValue(m.startsAt) ?? -Infinity) > now),
    ),
  )
    .sort((a, b) => Number(isLiveGame(b, now)) - Number(isLiveGame(a, now)))
    .slice(0, 4);
}
const decimalValue = (value?: string | null) =>
  value != null &&
  /^\d+(?:\.\d+)?$/.test(value) &&
  Number.isFinite(Number(value))
    ? Number(value)
    : -1;
export function competitiveValue(m: Market): number {
  if (m.competition != null) return m.competition;
  const prices = [
    ...m.contracts,
    ...m.children.flatMap((c) => c.contracts),
  ].flatMap((c) => {
    const p = decimalValue(c.buyYes ?? c.lastPrice);
    return p >= 0 && p <= 1 ? [Math.abs(0.5 - p)] : [];
  });
  return Math.min(...prices, ...m.children.map(competitiveValue), Infinity);
}
export function marketRelevance(m: Market, query: string) {
  const q = normalizeMarketSearch(query);
  if (!q) return 0;
  const title = normalizeMarketSearch(m.title);
  const labels = m.contracts.map((c) => normalizeMarketSearch(c.label));
  if (title === q || normalizeMarketSearch(m.ticker ?? "") === q) return 5;
  if (title.startsWith(q)) return 4;
  if (title.includes(q)) return 3;
  if (labels.some((label) => label === q || label.startsWith(q))) return 2;
  return q.split(/\s+/).every((word) => title.includes(word)) ? 1 : 0;
}
export function volumeValue(market: Market) {
  const value = Number(market.volume);
  return market.volume != null &&
    /^\d+(?:\.\d+)?$/.test(market.volume) &&
    Number.isFinite(value)
    ? value
    : -1;
}
export function sortMarkets(
  markets: Market[],
  sort: MarketSort = "volume",
  query = "",
  now = Date.now(),
) {
  const closing = (m: Market) => dateValue(m.closesAt) ?? Infinity;
  // A recency-weighted activity score, not a claim of 24-hour volume.
  const trending = (m: Market) => {
    const created = dateValue(m.createdAt);
    return created === null || volumeValue(m) < 0
      ? -1
      : volumeValue(m) / (24 + Math.max(0, now - created) / 3600000);
  };
  return [...markets].sort(
    (a, b) =>
      (sort === "relevance"
        ? marketRelevance(b, query) - marketRelevance(a, query)
        : sort === "trending"
          ? trending(b) - trending(a)
          : sort === "liquidity"
            ? decimalValue(b.liquidity) - decimalValue(a.liquidity)
            : sort === "newest"
              ? (dateValue(b.createdAt) ?? -Infinity) -
                (dateValue(a.createdAt) ?? -Infinity)
              : sort === "competitive"
                ? competitiveValue(a) - competitiveValue(b)
                : sort === "name"
                  ? a.title.localeCompare(b.title)
                  : sort === "closing"
                    ? closing(a) - closing(b)
                    : volumeValue(b) - volumeValue(a)) ||
      volumeValue(b) - volumeValue(a) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
}
export const normalizeMarketSearch = (text: string) =>
  text
    .toLowerCase()
    .replace(/\bnfl\b/g, "pro football")
    .replace(/\bnba\b/g, "pro basketball")
    .replace(/\bmost valuable player\b/g, "mvp")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function marketMatches(market: Market, query: string): boolean {
  const text = normalizeMarketSearch(
    [
      market.title,
      market.ticker,
      market.category,
      market.subcategory,
      market.searchText,
      ...market.contracts.map((c) => `${c.label} ${c.symbol}`),
      ...market.children.map((c) => marketSearchText(c)),
    ].join(" "),
  );
  return normalizeMarketSearch(query)
    .split(/\s+/)
    .every((word) => text.includes(word));
}
export function marketSearchText(m: Market): string {
  return [
    m.title,
    m.ticker,
    m.category,
    m.subcategory,
    ...m.contracts.map((c) => `${c.label} ${c.symbol}`),
    ...m.children.map(marketSearchText),
  ]
    .join(" ")
    .toLowerCase();
}
export function isPlayerProp(m: Market) {
  return (
    (m.sportsMarket?.type === "prop" && m.sportsMarket.subject === "player") ||
    /:\s*player\s/i.test(m.title)
  );
}
export function discoveryMarkets(markets: Market[]) {
  const nested = new Set<string>();
  const visit = (m: Market) =>
    m.children.forEach((c) => {
      nested.add(c.id);
      visit(c);
    });
  markets.forEach(visit);
  return sortMarkets([
    ...new Map(
      markets.filter((m) => !nested.has(m.id)).map((m) => [m.id, m]),
    ).values(),
  ]);
}
export function marketTeams(m: Market): Contract[] {
  if (m.teams?.length) return m.teams;
  if (
    m.sportsMarket?.type === "moneyline" ||
    (/\bvs\.?\s/i.test(m.title) && !m.title.includes(":"))
  )
    return m.contracts.filter((c) => c.imageUrl).slice(0, 2);
  return [];
}
export function outcomeImages(
  m: Market,
  c: Contract,
): { src: string; label: string }[] {
  const teams = marketTeams(m);
  // Nested display labels include the matchup title; match only the outcome.
  const label = c.label.split(" · ").at(-1)!;
  if (/^(more|less|over|under)\b/i.test(label) && teams.length)
    return teams.flatMap((t) =>
      t.imageUrl ? [{ src: t.imageUrl, label: t.label }] : [],
    );
  const team = teams.find((t) =>
    label.toLowerCase().includes(t.label.toLowerCase()),
  );
  if (team?.imageUrl) return [{ src: team.imageUrl, label: team.label }];
  return c.imageUrl ? [{ src: c.imageUrl, label: c.label }] : [];
}
