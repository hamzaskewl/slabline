import type { Contract, Market } from "./index";

export type MarketSort = "volume" | "closing" | "name";
export function volumeValue(market: Market) {
  const value = Number(market.volume);
  return market.volume != null &&
    /^\d+(?:\.\d+)?$/.test(market.volume) &&
    Number.isFinite(value)
    ? value
    : -1;
}
export function sortMarkets(markets: Market[], sort: MarketSort = "volume") {
  const closing = (m: Market) =>
    m.closesAt ? Date.parse(m.closesAt) || Infinity : Infinity;
  return [...markets].sort(
    (a, b) =>
      (sort === "name"
        ? a.title.localeCompare(b.title)
        : sort === "closing"
          ? closing(a) - closing(b)
          : volumeValue(b) - volumeValue(a)) ||
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
