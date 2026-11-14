import { expect, test } from "bun:test";
import {
  eligibleMarkets,
  eligibleCards,
  eligibleTokens,
  filterCards,
  relatedCards,
  matchingTokens,
  type Market,
  type Listing,
  type GrailToken,
  type RewardFilters,
} from "./index";

const market = (
  title: string,
  subcategory = "",
  status = "active",
): Market => ({
  id: title,
  title,
  subcategory,
  status,
  category: subcategory ? "Sports" : "Other",
  contracts: [],
  children: [],
  imageUrl: null,
  description: "",
  closesAt: null,
});
const card = (name: string, category: string, ask = "100"): Listing => ({
  id: name,
  mint: name,
  name,
  category,
  ask,
  player: null,
  grade: "GEM MT 10",
  grader: "PSA",
  cert: "123",
  year: "2024",
  set: null,
  frontImage: null,
  backImage: null,
  currency: "USDC",
  seller: null,
  network: "mainnet",
  source: "collectorcrypt",
  observedAt: new Date().toISOString(),
  valuation: null,
});
const token = (symbol: string, tags: string[]): GrailToken => ({
  id: symbol,
  symbol,
  name: symbol,
  tags,
  address: "0x" + "1".repeat(40),
  chainId: 8453,
  chain: "Base",
  image: null,
  url: `https://grail.xyz/trade/${symbol}`,
  observedAt: new Date().toISOString(),
});
const cards = [
  card("Michael Jordan", "Basketball"),
  card("Pikachu", "Pokemon"),
  card("Lionel Messi", "Soccer"),
];
const tokens = [
  token("gMJ", ["Basketball"]),
  token("gELON", ["Founder"]),
  token("gPIKA", ["TCG"]),
];

test("only active markets with a real inventory relationship qualify", () => {
  const nba = market("Bulls vs Lakers", "NBA");
  const tesla = market("Will Tesla launch a new model?");
  expect(
    eligibleMarkets(
      [
        nba,
        tesla,
        market("Bitcoin price today"),
        market("US inflation"),
        market("NBA finals", "NBA", "closed"),
      ],
      cards,
      tokens,
    ),
  ).toEqual([nba, tesla]);
  expect(eligibleMarkets([nba, tesla], [], [])).toEqual([]);
  expect(relatedCards(market("Bitcoin price today"), cards)).toEqual([]);
  expect(
    relatedCards(market("Premier League winner", "Soccer"), cards).map(
      (c) => c.name,
    ),
  ).toEqual(["Lionel Messi"]);
});
test("non-sports rewards need an active market; nested outcomes participate", () => {
  expect(
    eligibleCards(cards, [market("NBA champion", "NBA")]).map((c) => c.name),
  ).not.toContain("Pikachu");
  expect(eligibleTokens(tokens, []).map((t) => t.symbol)).toEqual(["gMJ"]);
  const nested = {
    ...market("Collectible prices"),
    children: [market("Pokémon prices this year")],
  };
  expect(eligibleCards(cards, [nested])).toEqual(cards);
  expect(eligibleTokens(tokens, [nested]).map((t) => t.symbol)).toEqual([
    "gMJ",
    "gPIKA",
  ]);
  expect(matchingTokens(market("Amazon quarterly revenue"), tokens)).toEqual(
    [],
  );
  expect(
    matchingTokens(market("Tesla quarterly revenue"), tokens).map(
      (t) => t.symbol,
    ),
  ).toEqual(["gELON"]);
});
test("price, grade and autograph filters work without mutating inventory", () => {
  const inventory = [
    card("Rookie RC", "Baseball", "15"),
    { ...card("Signed card", "Baseball", "1500"), autographed: true },
    card("Other card", "Basketball", "500"),
  ];
  const filters: RewardFilters = {
    search: "",
    category: "",
    grader: "",
    grade: "",
    min: "",
    max: "",
    feature: "",
    sort: "high",
  };
  expect(filterCards(inventory, filters).map((c) => c.ask)).toEqual([
    "1500",
    "500",
    "15",
  ]);
  expect(
    filterCards(inventory, {
      ...filters,
      min: "100",
      max: "1000",
      grade: "10",
      grader: "PSA",
    }).map((c) => c.ask),
  ).toEqual(["500"]);
  expect(
    filterCards(inventory, { ...filters, feature: "autograph" }).map(
      (c) => c.ask,
    ),
  ).toEqual(["1500"]);
  expect(
    filterCards(inventory, { ...filters, feature: "rookie" }).map((c) => c.ask),
  ).toEqual(["15"]);
  expect(
    filterCards(inventory, { ...filters, min: "1000", max: "10" }),
  ).toEqual([]);
  expect(inventory[0]!.ask).toBe("15");
});
