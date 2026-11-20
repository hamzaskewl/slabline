import type { Listing, Market } from "./index";
import history from "./nba-team-history.json";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const contains = (text: string, name: string) =>
  ` ${normalize(text)} `.includes(` ${normalize(name)} `);

// Retired-player associations supplement the observed roster snapshot. These
// are historical links, never claims about a current roster or a card's jersey.
const alumni = [
  {
    name: "San Antonio Spurs",
    players: ["Tim Duncan", "David Robinson", "Tony Parker", "Manu Ginobili"],
    source: "https://www.nba.com/team/1610612759/spurs/roster",
  },
  {
    name: "Philadelphia 76ers",
    players: ["Allen Iverson"],
    source: "https://www.nba.com/sixers/76ers-alumni/allen-iverson",
  },
  {
    name: "Los Angeles Lakers",
    players: ["Kobe Bryant", "Magic Johnson", "Shaquille O'Neal"],
    source: "https://www.nba.com/lakers/history/lakers-retired-numbers",
  },
  {
    name: "Chicago Bulls",
    players: ["Michael Jordan"],
    source: "https://www.nba.com/team/1610612741/historic-roster",
  },
];
const associations = [...history.teams, ...alumni];
const players = [...new Set(associations.flatMap((t) => t.players))].sort(
  (a, b) => b.length - a.length,
);

// Exact listings visually checked against their provider slab images on
// 2026-11-18. Draft Picks #2 is deliberately NOT labeled a Spurs card.
const reviewedCardTeams: Record<string, string> = {
  "35yegtSwqDj1veo5Axqv8xcRNvYHnGJV4QtsLcH9xdqB": "San Antonio Spurs",
  F4jEvi8xc1eDSe1qxWFmLKKRoTc3zi3tRUf3Suh49a6T: "San Antonio Spurs",
  "5UF5EuS7nYeUquj57JTN9qvYan6Knkqq9ww6AeMUWfgx": "Philadelphia 76ers",
  D7KvTTnk8dMAWhbwLNcR5E5HTnKGfSrz7b8S7HAhsiFn: "Philadelphia 76ers",
};

// Listing-specific exclusions override player history when the card is not
// a Lakers card.
const excludedTeamListings: Record<string, readonly string[]> = {
  "Los Angeles Lakers": [
    "F6As6zsDLNaaSoMsvPzqMF7k5WG9jg55mFHoQWM4VsWh",
    "CdrJym6gEGXR3aKYUJPBz2GHddRawHzDrBeV3BCMDnJ9",
  ],
};

export function cardPlayer(card: Listing): string | null {
  return (
    card.player ??
    (card.category === "Basketball"
      ? players.find((name) => contains(card.name, name))
      : null) ??
    null
  );
}
export function cardTeam(card: Listing): string | null {
  return (
    card.team ??
    (card.network === "mainnet" && card.category === "Basketball"
      ? reviewedCardTeams[card.mint]
      : null) ??
    (card.category === "Basketball"
      ? history.teams.find((team) => contains(card.name, team.name))?.name
      : null) ??
    null
  );
}
export function cardTeamSource(card: Listing): string | null {
  return (
    card.teamSource ?? (reviewedCardTeams[card.mint] ? card.frontImage : null)
  );
}

const codeAliases: Record<string, string> = {
  SAS: "SA",
  GSW: "GS",
  NYK: "NY",
  NOP: "NO",
  UTA: "UTAH",
};
/** Resolve only a selected NBA team outcome, not any team mentioned by an event. */
export function selectedRewardTeam(market: Market) {
  if (market.contracts.length !== 1) return null;
  const contract = market.contracts[0]!;
  if (!/^GEMI-(?:NBA-|NBAF-)/.test(contract.symbol)) return null;
  const code = contract.symbol.split("-").at(-1)!;
  const label = normalize(contract.label.split(" · ").at(-1)!);
  return (
    history.teams.find(
      (team) =>
        team.code === (codeAliases[code] ?? code) &&
        [
          team.name,
          team.city,
          team.code,
          team.code === "LAL"
            ? "LA Lakers"
            : team.code === "LAC"
              ? "LA Clippers"
              : "",
          team.code === "LAL"
            ? "Los Angeles L"
            : team.code === "LAC"
              ? "Los Angeles C"
              : "",
        ]
          .filter(Boolean)
          .some(
            (name) =>
              label === normalize(name) ||
              label.startsWith(`${normalize(name)} wins `),
          ),
    ) ?? null
  );
}
export function teamCardMatch(market: Market, card: Listing) {
  const team = selectedRewardTeam(market);
  if (!team || card.category !== "Basketball") return null;
  if (excludedTeamListings[team.name]?.includes(card.mint)) return null;
  const player = cardPlayer(card);
  if (cardTeam(card) === team.name)
    return {
      name: team.name,
      player: player ?? card.name,
      source: cardTeamSource(card) ?? team.source,
      basis: "card" as const,
    };
  const association =
    player &&
    associations.find(
      (t) =>
        t.name === team.name &&
        t.players.some((p) => normalize(p) === normalize(player)),
    );
  return association
    ? {
        name: team.name,
        player: player!,
        source: association.source,
        basis: "history" as const,
      }
    : null;
}
