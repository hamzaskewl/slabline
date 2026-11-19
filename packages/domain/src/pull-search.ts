import type { Market, PullTheme } from "./index";
import { marketMatches, marketTeams, marketSearchText } from "./discovery";
import history from "./nba-team-history.json";
const teams = history.teams.map((team) =>
  team.code === "LAC"
    ? { ...team, name: "Los Angeles Clippers", city: "Los Angeles" }
    : team,
);

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const playerAliases: Record<string, string> = {
  wemby: "Victor Wembanyama",
  wembenyama: "Victor Wembanyama",
  wembanyama: "Victor Wembanyama",
  jokic: "Nikola Jokic",
  lebron: "LeBron James",
};
const teamAliases = (team: (typeof history.teams)[number]) =>
  [
    team.name,
    team.code,
    team.name.slice(team.city.length).trim(),
    ...(teams.filter((other) => other.city === team.city).length === 1
      ? [team.city]
      : []),
    ...(team.code === "LAL"
      ? ["LA Lakers", "Los Angeles L"]
      : team.code === "LAC"
        ? ["LA Clippers", "Los Angeles C"]
        : []),
  ].filter(Boolean);

export function pullTeam(label: string) {
  return teams.find((team) =>
    teamAliases(team).some((alias) => normalize(alias) === normalize(label)),
  );
}

export function canonicalPullTheme(theme: PullTheme): PullTheme {
  if (theme.kind === "all") return theme;
  const label = theme.label.trim();
  return {
    ...theme,
    label:
      theme.kind === "team"
        ? (pullTeam(label)?.name ?? label)
        : (playerAliases[normalize(label)] ?? label),
  };
}

export function pullSearchQuery(theme: PullTheme, search = "") {
  const canonical = canonicalPullTheme(theme);
  if (canonical.kind === "all") return search.trim();
  return canonical.kind === "team"
    ? (pullTeam(canonical.label)?.city ?? canonical.label)
    : canonical.label;
}

export function matchesPullTheme(market: Market, theme: PullTheme) {
  if (theme.kind === "all") return true;
  if (!theme.label.trim()) return false;
  const canonical = canonicalPullTheme(theme);
  if (canonical.kind === "all") return true;
  if (canonical.kind === "player")
    return (
      marketMatches(market, canonical.label) ||
      marketMatches(market, theme.label)
    );
  const team = pullTeam(canonical.label);
  const aliases = team ? teamAliases(team) : [canonical.label];
  return aliases.some(
    (alias) =>
      marketTeams(market).some((entry) =>
        alias.length <= 3
          ? normalize(entry.label) === normalize(alias)
          : normalize(entry.label).includes(normalize(alias)),
      ) ||
      (alias.length > 3 &&
        ` ${normalize(`${marketSearchText(market)} ${market.searchText ?? ""}`)} `.includes(
          ` ${normalize(alias)} `,
        )),
  );
}

export function availablePullTeams(markets: Market[]) {
  const labels = markets.flatMap((market) =>
    marketTeams(market).map((team) => team.label),
  );
  // Futures may expose teams only as contract labels or searchable outcome text.
  teams.forEach((team) => {
    if (
      markets.some((market) =>
        matchesPullTheme(market, { kind: "team", label: team.name }),
      )
    )
      labels.push(team.name);
  });
  return [
    ...new Set(labels.map((label) => pullTeam(label)?.name ?? label)),
  ].sort((a, b) => a.localeCompare(b));
}

export function pullMarketTitle(market: Market) {
  return marketTeams(market).reduce((title, team) => {
    const canonical = pullTeam(team.label)?.name;
    if (!canonical || canonical === team.label) return title;
    const escaped = team.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return title.replace(new RegExp(`\\b${escaped}\\b`, "gi"), canonical);
  }, market.title);
}
