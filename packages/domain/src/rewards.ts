import type { Listing, Market } from "./index";

export type GrailToken = {
  id: string;
  symbol: string;
  name: string;
  address: string;
  chainId: number;
  chain: string;
  image: string | null;
  tags: string[];
  url: string;
  observedAt: string;
};

// Subject names are from grail.xyz/trade/<symbol>. Catalog availability and
// addresses always come from Grail; this vocabulary is only for matching.
export const grailSubjects: Record<
  string,
  { name: string; aliases: string[] }
> = {
  gmbappe: { name: "Kylian Mbappé", aliases: ["mbappe"] },
  gallen: { name: "Josh Allen", aliases: ["josh allen"] },
  gdoue: { name: "Désiré Doué", aliases: ["desire doue"] },
  gmonk: { name: "Monkey D. Luffy", aliases: ["luffy", "one piece"] },
  jensen: { name: "Jensen Huang", aliases: ["jensen huang", "nvidia"] },
  gyamal: { name: "Lamine Yamal", aliases: ["lamine yamal"] },
  gluka: { name: "Luka Dončić", aliases: ["luka doncic"] },
  gwemby: { name: "Victor Wembanyama", aliases: ["wembanyama", "wemby"] },
  gcade: { name: "Cade Cunningham", aliases: ["cade cunningham"] },
  gswift: { name: "Taylor Swift", aliases: ["taylor swift"] },
  gchar: { name: "Charizard", aliases: ["charizard", "pokemon"] },
  gvitalik: { name: "Vitalik Buterin", aliases: ["vitalik"] },
  gpuli: { name: "Christian Pulisic", aliases: ["pulisic"] },
  gkai: { name: "Kai Cenat", aliases: ["kai cenat"] },
  gcoop: { name: "Cooper Flagg", aliases: ["cooper flagg"] },
  gbrady: { name: "Tom Brady", aliases: ["tom brady"] },
  gelon: { name: "Elon Musk", aliases: ["elon musk", "tesla", "spacex"] },
  gmessi: { name: "Lionel Messi", aliases: ["messi"] },
  gmj: { name: "Michael Jordan", aliases: ["michael jordan"] },
  gkirk: { name: "Charlie Kirk", aliases: ["charlie kirk"] },
  gronaldo: { name: "Cristiano Ronaldo", aliases: ["cristiano ronaldo"] },
  gkobe: { name: "Kobe Bryant", aliases: ["kobe bryant"] },
  gbron: { name: "LeBron James", aliases: ["lebron"] },
  gshai: { name: "Shai Gilgeous-Alexander", aliases: ["gilgeous alexander"] },
  gohtani: { name: "Shohei Ohtani", aliases: ["ohtani"] },
  gpika: { name: "Pikachu", aliases: ["pikachu", "pokemon"] },
  gbrun: { name: "Jalen Brunson", aliases: ["jalen brunson"] },
  vlad: { name: "Vlad Tenev", aliases: ["vlad tenev", "robinhood"] },
  gspeed: { name: "IShowSpeed", aliases: ["ishowspeed", "i show speed"] },
  bezos: {
    name: "Jeff Bezos",
    aliases: ["jeff bezos", "amazon", "blue origin"],
  },
};
export const sportCategories = [
  "Basketball",
  "Baseball",
  "Football",
  "Soccer",
  "Hockey",
  "Boxing & MMA",
  "Tennis",
  "Golf",
  "Racing",
  "Wrestling",
  "Cricket",
  "Rugby",
  "Sports",
];
const sportAliases: Record<string, string[]> = {
  Basketball: ["basketball", "nba", "wnba", "ncaab"],
  Baseball: ["baseball", "mlb"],
  Football: ["football", "nfl", "ncaaf"],
  Soccer: [
    "soccer",
    "epl",
    "premier league",
    "champions league",
    "fifa",
    "la liga",
    "serie a",
    "bundesliga",
    "ligue 1",
    "mls",
  ],
  Hockey: ["hockey", "nhl"],
  "Boxing & MMA": ["boxing", "mma", "ufc"],
  Tennis: ["tennis", "atp", "wta"],
  Golf: ["golf", "pga"],
  Racing: ["formula 1", "f1", "nascar", "racing"],
  Wrestling: ["wrestling", "wwe"],
  Cricket: ["cricket", "ipl"],
  Rugby: ["rugby"],
};
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const includes = (text: string, term: string) =>
  ` ${normalize(text)} `.includes(` ${normalize(term)} `);
export function marketText(market: Market): string {
  return [
    market.title,
    market.category,
    market.subcategory ?? "",
    market.searchText ?? "",
    ...market.contracts.map((c) => c.label),
    ...market.children.map(marketText),
  ].join(" ");
}
export function sportsForMarket(market: Market) {
  const text = marketText(market);
  const sports = Object.entries(sportAliases)
    .filter(([, aliases]) => aliases.some((a) => includes(text, a)))
    .map(([sport]) => sport);
  // "Football" can mean either sport; explicit soccer competitions take priority.
  return sports.includes("Soccer")
    ? sports.filter((s) => s !== "Football")
    : sports;
}
export function tokenSport(token: GrailToken) {
  if (token.tags.includes("American Football")) return "Football";
  if (token.tags.includes("Football")) return "Soccer";
  return token.tags.find((tag) => sportCategories.includes(tag));
}
export function matchingTokens(market: Market, tokens: GrailToken[]) {
  const text = marketText(market),
    sports = sportsForMarket(market);
  return tokens.filter((token) => {
    const sport = tokenSport(token);
    return (
      (sport && sports.includes(sport)) ||
      (grailSubjects[token.symbol.toLowerCase()]?.aliases ?? [token.name]).some(
        (a) => includes(text, a),
      )
    );
  });
}
export function relatedCards(market: Market, cards: Listing[]) {
  const text = marketText(market),
    sports = sportsForMarket(market);
  const subjects = [
    ...Object.values(grailSubjects),
    { name: "Donald Trump", aliases: ["trump"] },
    { name: "Barack Obama", aliases: ["obama"] },
  ].filter((subject) => subject.aliases.some((a) => includes(text, a)));
  return cards.filter((card) => {
    if (sports.includes(card.category)) return true;
    if (card.player && includes(text, card.player)) return true;
    if (
      ["Pokemon", "One Piece", "Riftbound"].includes(card.category) &&
      includes(text, card.category)
    )
      return true;
    return subjects.some((subject) => includes(card.name, subject.name));
  });
}
export function rewardCategories(markets: Market[]) {
  const text = markets.filter(activeMarket).map(marketText).join(" ");
  return [
    ...sportCategories,
    ...["Pokemon", "One Piece", "Riftbound"].filter((c) => includes(text, c)),
    ...([
      "trump",
      "obama",
      ...Object.values(grailSubjects).flatMap((s) => s.aliases),
    ].some((a) => includes(text, a))
      ? ["Non-Sport"]
      : []),
  ];
}
export const activeMarket = (market: Market) =>
  ["active", "open"].includes(market.status.toLowerCase());
export function eligibleMarkets(
  markets: Market[],
  cards: Listing[],
  tokens: GrailToken[],
) {
  return markets.filter(
    (m) =>
      activeMarket(m) &&
      (relatedCards(m, cards).length > 0 ||
        matchingTokens(m, tokens).length > 0),
  );
}
export function eligibleCards(cards: Listing[], markets: Market[]) {
  return cards.filter(
    (c) =>
      sportCategories.includes(c.category) ||
      markets.some((m) => activeMarket(m) && relatedCards(m, [c]).length > 0),
  );
}
export function eligibleTokens(tokens: GrailToken[], markets: Market[]) {
  return tokens.filter(
    (t) =>
      tokenSport(t) ||
      markets.some((m) => activeMarket(m) && matchingTokens(m, [t]).length > 0),
  );
}

export type RewardFilters = {
  search: string;
  category: string;
  grader: string;
  grade: string;
  min: string;
  max: string;
  feature: string;
  sort: string;
};
export function filterCards(cards: Listing[], f: RewardFilters) {
  return cards
    .filter(
      (c) =>
        (!f.search ||
          normalize(`${c.name} ${c.set ?? ""}`).includes(
            normalize(f.search),
          )) &&
        (!f.category || c.category === f.category) &&
        (!f.grader || c.grader === f.grader) &&
        (!f.grade || c.grade?.match(/\d+(?:\.\d+)?/)?.[0] === f.grade) &&
        (!f.min || Number(c.ask) >= Number(f.min)) &&
        (!f.max || Number(c.ask) <= Number(f.max)) &&
        (f.feature !== "autograph" ||
          c.autographed === true ||
          /\b(autograph|signed|auto)\b/i.test(c.name)) &&
        (f.feature !== "rookie" || /\b(rookie|rc)\b/i.test(c.name)),
    )
    .sort((a, b) =>
      f.sort === "low"
        ? Number(a.ask) - Number(b.ask)
        : f.sort === "name"
          ? a.name.localeCompare(b.name)
          : Number(b.ask) - Number(a.ask),
    );
}
