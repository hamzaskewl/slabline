import { expect, test } from "bun:test";
import {
  discoveryMarkets,
  isPlayerProp,
  marketMatches,
  marketPreview,
  outcomeImages,
  sortMarkets,
  marketStatusMatches,
  type Market,
} from "./index";
const market = (
  id: string,
  title: string,
  volume: string | null = null,
): Market => ({
  id,
  title,
  volume,
  category: "Sports",
  status: "active",
  imageUrl: null,
  contracts: [],
  children: [],
  description: "",
  closesAt: null,
});
test("search ranks exact and title matches ahead of volume, then volume within a match tier", () => {
  const broad = {
    ...market("b", "Basketball Champion", "1000000"),
    searchText: "San Antonio",
  };
  const low = market("l", "San Antonio vs Boston", "10");
  const high = market("h", "San Antonio vs Dallas", "100");
  const exact = market("e", "San Antonio", "1");
  expect(
    sortMarkets([broad, low, high, exact], "relevance", "San Antonio").map(
      (m) => m.id,
    ),
  ).toEqual(["e", "h", "l", "b"]);
});
test("discovery sorts real metrics and puts missing values last", () => {
  const older = {
    ...market("o", "Older", "100"),
    createdAt: "2026-01-01T00:00:00Z",
    liquidity: "200",
    closesAt: "2026-12-01T00:00:00Z",
  };
  const newer = {
    ...market("n", "Newer", "50"),
    createdAt: "2026-02-01T00:00:00Z",
    liquidity: "50",
    closesAt: "2026-11-01T00:00:00Z",
  };
  const missing = market("m", "Missing", "1000");
  const input = [missing, older, newer];
  expect(sortMarkets(input, "newest").map((m) => m.id)).toEqual([
    "n",
    "o",
    "m",
  ]);
  expect(sortMarkets(input, "liquidity").map((m) => m.id)).toEqual([
    "o",
    "n",
    "m",
  ]);
  expect(sortMarkets(input, "closing").map((m) => m.id)).toEqual([
    "n",
    "o",
    "m",
  ]);
  expect(
    sortMarkets(input, "trending", "", Date.parse("2026-02-02T00:00:00Z")).map(
      (m) => m.id,
    ),
  ).toEqual(["n", "o", "m"]);
  expect(marketStatusMatches({ ...older, status: "settled" }, "resolved")).toBe(
    true,
  );
  expect(marketStatusMatches({ ...older, status: "closed" }, "resolved")).toBe(
    false,
  );
  expect(marketStatusMatches({ ...older, status: "closed" }, "all")).toBe(true);
});
test("discovery ranks numerical volume descending, preserving zero and unknown volumes", () => {
  const input = [
    market("1", "Player assists", "9"),
    market("2", "MVP", "149113"),
    market("3", "No volume"),
    market("4", "New event", "0"),
    market("5", "Championship", "20000"),
  ];
  expect(sortMarkets(input).map((m) => m.id)).toEqual([
    "2",
    "5",
    "1",
    "4",
    "3",
  ]);
  expect(input[0]!.id).toBe("1");
});
test("search handles league aliases, reordered words, punctuation, hidden contracts and tickers", () => {
  const m = market("mvp", "Pro Football MVP Winner");
  m.ticker = "NFLMVP2026";
  m.contracts = Array.from({ length: 30 }, (_, i) => ({
    symbol: `GEMI-MVP-${i}`,
    label: i === 29 ? "Josh Allen" : `Player ${i}`,
    status: "active",
    lastPrice: null,
    quantityIncrement: null,
    priceIncrement: null,
  }));
  const preview = marketPreview(m);
  expect(preview.contracts).toHaveLength(2);
  for (const query of [
    " MVP ",
    "NFL MVP",
    "MVP football",
    "most valuable player",
    "Josh Allen",
    "NFLMVP2026",
  ])
    expect(marketMatches(preview, query)).toBe(true);
  expect(marketMatches(preview, "basketball")).toBe(false);
});
test("nested player props stay under their parent without suppressing MVP futures", () => {
  const prop = market("prop", "Boston vs Denver: Player Assists", "200");
  const game = {
    ...market("game", "Boston vs Denver", "500"),
    children: [prop],
  };
  const mvp = {
    ...market("mvp", "Pro Football MVP Winner", "149113"),
    sportsMarket: { type: "futures", subject: "player" },
  };
  expect(discoveryMarkets([prop, game, mvp]).map((m) => m.id)).toEqual([
    "mvp",
    "game",
  ]);
  expect(isPlayerProp(prop)).toBe(true);
  expect(isPlayerProp(mvp)).toBe(false);
  expect(marketMatches(marketPreview(game), "assists")).toBe(true);
});
test("totals reuse both provider team shoes; spreads use the matching team's shoe", () => {
  const team = (label: string) => ({
    symbol: label,
    label,
    imageUrl: `https://assets.gemini.com/${label}.png`,
    status: "active",
    lastPrice: null,
    quantityIncrement: null,
    priceIncrement: null,
  });
  const game = {
    ...market("game", "Boston vs Denver"),
    contracts: [team("Boston"), team("Denver")],
  };
  expect(
    outcomeImages(game, {
      ...team("More than 220.5 points scored"),
      imageUrl: "https://assets.gemini.com/basketball.png",
    }).map((i) => i.label),
  ).toEqual(["Boston", "Denver"]);
  expect(
    outcomeImages(game, team("Denver wins by more than 2.5 points")).map(
      (i) => i.label,
    ),
  ).toEqual(["Denver"]);
  expect(marketPreview(game).teams).toHaveLength(2);
  expect(
    outcomeImages(
      game,
      team("Boston vs Denver: Total Points · More than 220.5 points scored"),
    ).map((i) => i.label),
  ).toEqual(["Boston", "Denver"]);
  expect(
    outcomeImages(
      game,
      team(
        "Boston vs Denver: Point Spread · Denver wins by more than 2.5 points",
      ),
    ).map((i) => i.label),
  ).toEqual(["Denver"]);
});
