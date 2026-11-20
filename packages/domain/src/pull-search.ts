import {
  marketOutcomes,
  type Contract,
  type Market,
  type PullTheme,
} from "./index";
import { marketTeams, marketSearchText } from "./discovery";
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
function playerAliasPrefix(label: string) {
  const query = normalize(label);
  if (query.length < 3) return undefined;
  const names = [
    ...new Set(
      Object.entries(playerAliases)
        .filter(([alias]) => alias.startsWith(query))
        .map(([, name]) => name),
    ),
  ];
  return names.length === 1 ? names[0] : undefined;
}

function oneNameEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (i === a.length) return b.length - a.length <= 1;
  if (a.length < b.length) return a.slice(i) === b.slice(i + 1);
  if (a.length > b.length) return a.slice(i + 1) === b.slice(i);
  return (
    a.slice(i + 1) === b.slice(i + 1) ||
    (a[i] === b[i + 1] &&
      a[i + 1] === b[i] &&
      a.slice(i + 2) === b.slice(i + 2))
  );
}

/** Resolve partial names from actual sports outcomes, without inventing players. */
export function pullPlayerMatches(label: string, markets: Market[]): string[] {
  const query = normalize(label).split(" ");
  if (normalize(label).length < 3 || query.some((word) => word.length < 2))
    return [];
  const matches = new Map<string, { label: string; edits: number }>();
  const inspect = (market: Market) => {
    if (!sportsPullMarket(market)) return;
    const texts = [
      market.title,
      market.searchText ?? "",
      ...market.contracts.map((c) => c.label),
    ];
    for (const text of texts) {
      const words =
        text
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .match(/[a-z0-9]+/gi) ?? [];
      for (let start = 0; start <= words.length - query.length; start++) {
        let edits = 0;
        for (let offset = 0; offset < query.length; offset++) {
          const input = query[offset]!;
          const word = words[start + offset]!.toLowerCase();
          if (word.startsWith(input)) continue;
          if (
            input.length >= 4 &&
            word.length >= 4 &&
            (oneNameEdit(input, word) ||
              oneNameEdit(input, word.slice(0, input.length)))
          ) {
            edits++;
          } else {
            edits = 2;
            break;
          }
        }
        if (edits > 1) continue;
        const name = words
          .slice(start, start + query.length)
          .map((word) => word[0]!.toUpperCase() + word.slice(1))
          .join(" ");
        const key = normalize(name);
        const current = matches.get(key);
        if (!current || edits < current.edits)
          matches.set(key, { label: name, edits });
      }
    }
    market.children.forEach(inspect);
  };
  markets.forEach(inspect);
  const best = Math.min(...[...matches.values()].map((match) => match.edits));
  return [...matches.values()]
    .filter((match) => match.edits === best)
    .map((match) => match.label);
}

function uniquePlayerMatch(label: string, markets: Market[]) {
  const matches = pullPlayerMatches(label, markets);
  return matches.length === 1 ? matches[0] : undefined;
}
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
  const query = normalize(label);
  const exact = teams.find((team) =>
    teamAliases(team).some((alias) => normalize(alias) === query),
  );
  if (exact || query.length < 3) return exact;
  const prefixes = teams.filter((team) =>
    teamAliases(team).some((alias) => normalize(alias).startsWith(query)),
  );
  return prefixes.length === 1 ? prefixes[0] : undefined;
}

export function canonicalPullTheme(
  theme: PullTheme,
  markets: Market[] = [],
): PullTheme {
  if (theme.kind === "all") return theme;
  const label = theme.label.trim();
  return {
    ...theme,
    label:
      theme.kind === "team"
        ? markets.some(
            (market) =>
              otherSport(market) &&
              marketTeams(market).some((team) =>
                phraseMatches(team.label, label),
              ),
          )
          ? label
          : (pullTeam(label)?.name ?? label)
        : (playerAliases[normalize(label)] ??
          playerAliasPrefix(label) ??
          uniquePlayerMatch(label, markets) ??
          label),
  };
}

export function pullSearchQuery(theme: PullTheme, search = "") {
  const canonical = canonicalPullTheme(theme);
  if (canonical.kind === "all") return search.trim();
  return canonical.kind === "team"
    ? (pullTeam(canonical.label)?.city ?? canonical.label)
    : canonical.label;
}

export function sportsPullMarket(market: Market): boolean {
  return (
    !!market.sportsMarket?.sport ||
    /^(sports|basketball|football|baseball|soccer|hockey|tennis|golf|racing|boxing(?: & mma)?|cricket|rugby|wrestling)$/i.test(
      market.category,
    )
  );
}

const phraseMatches = (text: string, label: string) =>
  !!normalize(label) &&
  ` ${normalize(text)} `.includes(` ${normalize(label)} `);

function otherSport(market: Market): boolean {
  return /\b(football|nfl|baseball|mlb|hockey|nhl|soccer|tennis|golf|racing|cricket|rugby)\b/i.test(
    [
      market.category,
      market.subcategory,
      market.sportsMarket?.sport,
      market.ticker,
    ].join(" "),
  );
}

export function pullOutcomeLabel(market: Market, outcome: Contract) {
  return otherSport(market)
    ? outcome.label
    : (pullTeam(outcome.label)?.name ?? outcome.label);
}

function themeLabels(
  theme: Exclude<PullTheme, { kind: "all" }>,
  market: Market,
) {
  if (theme.kind === "team" && otherSport(market)) return [theme.label];
  const canonical = canonicalPullTheme(theme) as typeof theme;
  const team = canonical.kind === "team" && pullTeam(canonical.label);
  return team ? teamAliases(team) : [canonical.label];
}

export function matchesPullTheme(market: Market, theme: PullTheme): boolean {
  if (theme.kind === "all") return true;
  if (!sportsPullMarket(market) || !theme.label.trim()) return false;
  const labels = themeLabels(theme, market);
  // A contiguous name is required: Josh Jacobs + Keenan Allen is not Josh Allen.
  const text = `${marketSearchText(market)} ${market.searchText ?? ""}`;
  return labels.some(
    (label) =>
      phraseMatches(text, label) ||
      marketTeams(market).some((team) => phraseMatches(team.label, label)),
  );
}

/** Limit a themed pack to its selected subject, including outcomes hidden in previews. */
export function pullThemeOutcomes(
  market: Market,
  theme: PullTheme,
): Contract[] {
  const outcomes = marketOutcomes(market).filter((outcome) =>
    /^(active|open)$/i.test(outcome.status),
  );
  if (theme.kind === "all") return outcomes;
  if (!matchesPullTheme(market, theme)) return [];
  const labels = themeLabels(theme, market);
  const direct = outcomes.filter((outcome) =>
    labels.some((label) => phraseMatches(outcome.label, label)),
  );
  if (direct.length) return direct;
  // A named player/team prop may have generic Yes, Over, or Under outcomes.
  return labels.some((label) => phraseMatches(market.title, label)) &&
    (outcomes.length === 1 ||
      outcomes.every((outcome) =>
        /^(yes|no|over|under|more|less)(?:\b|$)/i.test(outcome.label),
      ))
    ? outcomes
    : [];
}

export function availablePullTeams(markets: Market[]) {
  markets = markets.filter(sportsPullMarket);
  const labels = markets.flatMap((market) =>
    marketTeams(market).map((team) => pullOutcomeLabel(market, team)),
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
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}

export function pullMarketTitle(market: Market) {
  if (otherSport(market)) return market.title;
  return marketTeams(market).reduce((title, team) => {
    const canonical = pullTeam(team.label)?.name;
    if (!canonical || canonical === team.label) return title;
    const escaped = team.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return title.replace(new RegExp(`\\b${escaped}\\b`, "gi"), canonical);
  }, market.title);
}
