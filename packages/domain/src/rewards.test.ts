import { expect, test } from "bun:test";
import {
  eligibleMarkets,
  eligibleCards,
  eligibleTokens,
  filterCards,
  relatedCards,
  matchingTokens,
  outcomeRewardMarket,
  teamRewardMatch,
  rewardForPayout,
  indicativeTokens,
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

test("dynamic rewards select the highest covered card and the next threshold exactly", () => {
  const options = [
    card("Wemby A", "Basketball", "145"),
    card("Wemby B", "Basketball", "250"),
    card("Wemby C", "Basketball", "299"),
  ];
  expect(rewardForPayout(options, "144.999999").covered).toBe(false);
  expect(rewardForPayout(options, "145").card?.ask).toBe("145");
  expect(rewardForPayout(options, "249.999999").card?.ask).toBe("145");
  expect(rewardForPayout(options, "250").card?.ask).toBe("250");
  expect(rewardForPayout(options, "300").card?.ask).toBe("299");
  expect(rewardForPayout(options, "300").next).toBeNull();
  expect(rewardForPayout(options, null).covered).toBe(false);
  expect(rewardForPayout([], "500").card).toBeNull();
  // Lowering the payout must downgrade the preview too.
  expect(rewardForPayout(options, "146").next?.ask).toBe("250");
});

test("indicative token estimates retain precision without implying physical redemption", () => {
  expect(indicativeTokens("100", "0.1")).toBe("1000.000000");
  expect(indicativeTokens("100", "3")).toBe("33.333333");
  expect(indicativeTokens("1", "0.000000000001")).toBe("1000000000000.000000");
  expect(indicativeTokens(null, "1")).toBeNull();
  expect(indicativeTokens("100", null)).toBeNull();
  expect(indicativeTokens("100", "0")).toBeNull();
  expect(indicativeTokens("100", "NaN")).toBeNull();
});
const tokens = [
  token("gMJ", ["Basketball"]),
  token("gELON", ["Founder"]),
  token("gPIKA", ["TCG"]),
];

test("team rewards require the exact selected NBA team and an unexpired roster link", () => {
  const phoenix = {
    symbol: "GEMI-NBA-2611152100-LAL-PHX-M-PHX",
    label: "Phoenix",
    status: "active",
    lastPrice: null,
    quantityIncrement: "0.01",
    priceIncrement: "0.01",
  };
  const lakers = {
    ...phoenix,
    symbol: "GEMI-NBA-2611152100-LAL-PHX-M-LAL",
    label: "Los Angeles L",
  };
  const event = {
    ...market("Los Angeles L vs Phoenix", "Pro Basketball"),
    contracts: [lakers, phoenix],
  };
  const booker = card("2015 Devin Booker PSA 9", "Basketball", "125");
  const now = Date.parse("2026-11-14T00:00:00Z");
  expect(
    teamRewardMatch(outcomeRewardMarket(event, phoenix), booker, now)?.name,
  ).toBe("Phoenix Suns");
  expect(
    teamRewardMatch(outcomeRewardMarket(event, lakers), booker, now),
  ).toBeNull();
  expect(
    teamRewardMatch(event, card("Random football player", "Football"), now),
  ).toBeNull();
  expect(
    teamRewardMatch(
      {
        ...event,
        contracts: [
          { ...phoenix, symbol: phoenix.symbol.replace("NBA", "NCAAB") },
        ],
      },
      booker,
      now,
    ),
  ).toBeNull();
  expect(
    teamRewardMatch(event, booker, Date.parse("2026-12-15T00:00:00Z")),
  ).toBeNull();
});

test("only active markets with a real inventory relationship qualify", () => {
  const nba = market("Michael Jordan award", "NBA");
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
  ).toEqual([]);
});

test("a selected player outcome never inherits unrelated players from the event", () => {
  const inventory = [
    card("2017 Patrick Mahomes II PSA 10 Donruss Optic", "Football", "4100"),
    card("2023 Jahmyr Gibbs ROOKIE CGC 10", "Football", "21"),
    card("2020 Justin Herbert PSA 9", "Football", "15"),
  ];
  const contract = (label: string) => ({
    symbol: label,
    label,
    status: "active",
    lastPrice: null,
    quantityIncrement: "1",
    priceIncrement: "0.01",
  });
  const m = {
    ...market("NFL MVP Winner", "NFL"),
    contracts: [contract("Patrick Mahomes"), contract("Justin Herbert")],
  };
  expect(
    relatedCards(outcomeRewardMarket(m, m.contracts[0]!), inventory).map(
      (c) => c.ask,
    ),
  ).toEqual(["4100"]);
  expect(
    relatedCards(
      outcomeRewardMarket(m, contract("Jahmyr Gibbs 1+ Touchdowns scored")),
      inventory,
    ).map((c) => c.ask),
  ).toEqual(["21"]);
  expect(
    relatedCards(market("Texas A&M vs Texas", "Football"), inventory),
  ).toEqual([]);
  expect(
    matchingTokens(market("Texas A&M vs Texas", "Football"), [
      token("gBRADY", ["American Football"]),
    ]),
  ).toEqual([]);
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
