import { expect, test } from "bun:test";
import {
  availablePullTeams,
  canonicalPullTheme,
  matchesPullTheme,
  pullSearchQuery,
  marketPreview,
  pullThemeOutcomes,
  pullMarketTitle,
  pullOutcomeLabel,
  type Market,
} from "./index";

const market: Market = {
  id: "game",
  ticker: "NBA-GAME",
  title: "Los Angeles C vs San Antonio",
  category: "Sports",
  status: "active",
  imageUrl: null,
  contracts: [],
  children: [],
  description: "",
  closesAt: null,
  teams: ["Los Angeles C", "San Antonio"].map((label) => ({
    label,
    symbol: label,
    status: "active",
    lastPrice: null,
    priceIncrement: null,
    quantityIncrement: null,
  })),
};

test("Spurs, San Antonio and the full team name find the same market and canonical label", () => {
  for (const label of ["Spurs", "San Antonio", "san antonio spurs", "SA"]) {
    expect(matchesPullTheme(market, { kind: "team", label })).toBe(true);
    expect(canonicalPullTheme({ kind: "team", label })).toEqual({
      kind: "team",
      label: "San Antonio Spurs",
    });
    expect(pullSearchQuery({ kind: "team", label })).toBe("San Antonio");
  }
  expect(availablePullTeams([market])).toEqual([
    "Los Angeles Clippers",
    "San Antonio Spurs",
  ]);
  expect(
    matchesPullTheme(
      { ...market, teams: [], title: "Kansas City vs Seattle" },
      { kind: "team", label: "Spurs" },
    ),
  ).toBe(false);
});

test("player aliases match MVP outcomes beyond the compact market preview", () => {
  const full = {
    ...market,
    teams: [],
    title: "NBA Most Valuable Player",
    contracts: [
      "Shai Gilgeous-Alexander",
      "Luka Doncic",
      "Victor Wembanyama",
      "Nikola Jokić",
      "LeBron James",
    ].map((label) => ({
      label,
      symbol: label,
      status: "active",
      lastPrice: null,
      priceIncrement: null,
      quantityIncrement: null,
    })),
  };
  const preview = marketPreview(full);
  for (const label of ["Wemby", "Wembenyama", "Wembanyama", "Jokic", "LeBron"])
    expect(matchesPullTheme(preview, { kind: "player", label })).toBe(true);
  expect(matchesPullTheme(market, { kind: "player", label: "Wemby" })).toBe(
    false,
  );
  expect(matchesPullTheme(market, { kind: "player", label: "" })).toBe(false);
});

const contract = (label: string, symbol = label) => ({
  label,
  symbol,
  status: "active",
  lastPrice: null,
  quantityIncrement: "1",
  priceIncrement: "0.01",
});

test("team/player themes are sports-only, while All markets includes other categories", () => {
  const news = {
    ...market,
    category: "Business",
    title: "LeBron James buys the San Antonio Spurs",
    teams: [],
  };
  expect(
    matchesPullTheme(news, { kind: "player", label: "LeBron James" }),
  ).toBe(false);
  expect(matchesPullTheme(news, { kind: "team", label: "Spurs" })).toBe(false);
  expect(matchesPullTheme(news, { kind: "all" })).toBe(true);
  expect(availablePullTeams([news])).toEqual([]);
});

test("Josh Allen must be one named subject, not words from different players or an inferred roster", () => {
  const wrong = {
    ...market,
    title: "Arizona vs Kansas City",
    teams: [],
    contracts: [contract("Josh Jacobs"), contract("Keenan Allen")],
  };
  expect(matchesPullTheme(wrong, { kind: "player", label: "Josh Allen" })).toBe(
    false,
  );
  const bills = {
    ...wrong,
    title: "Miami vs Buffalo",
    contracts: [
      contract("Josh Allen 2+ passing touchdowns"),
      contract("James Cook 50+ rushing yards"),
    ],
  };
  expect(matchesPullTheme(bills, { kind: "player", label: "Josh Allen" })).toBe(
    true,
  );
  expect(
    pullThemeOutcomes(bills, { kind: "player", label: "Josh Allen" }).map(
      (c) => c.label,
    ),
  ).toEqual(["Josh Allen 2+ passing touchdowns"]);
  expect(
    matchesPullTheme(
      { ...bills, contracts: [] },
      { kind: "player", label: "Josh Allen" },
    ),
  ).toBe(false);
});

test("a San Antonio pack locks to San Antonio even when it is beyond the first two outcomes", () => {
  const futures = {
    ...market,
    title: "Pro Basketball Best Regular Season Record",
    teams: [],
    contracts: [
      contract("Boston", "BOS"),
      contract("Oklahoma City", "OKC"),
      contract("San Antonio", "SAS"),
    ],
  };
  expect(
    pullThemeOutcomes(futures, { kind: "team", label: "Spur" }).map(
      (c) => c.symbol,
    ),
  ).toEqual(["SAS"]);
  expect(pullThemeOutcomes(futures, { kind: "all" })).toHaveLength(3);
  expect(
    pullThemeOutcomes(futures, { kind: "player", label: "Wemby" }),
  ).toEqual([]);
});

test("player outcomes exclude teams and preserve named binary props", () => {
  const mixed = {
    ...market,
    title: "Basketball MVP",
    teams: [],
    contracts: [
      contract("San Antonio"),
      contract("Victor Wembanyama"),
      contract("LeBron James"),
    ],
  };
  expect(
    pullThemeOutcomes(mixed, { kind: "player", label: "Wemb" }).map(
      (c) => c.label,
    ),
  ).toEqual(["Victor Wembanyama"]);
  const prop = {
    ...mixed,
    title: "Josh Allen 2+ touchdowns",
    contracts: [contract("Yes", "ALLEN-PROP")],
  };
  expect(
    pullThemeOutcomes(prop, { kind: "player", label: "Josh Allen" }).map(
      (c) => c.symbol,
    ),
  ).toEqual(["ALLEN-PROP"]);
});

test("football Miami remains Miami, never Miami Heat, and city themes retain their sport context", () => {
  const football = {
    ...market,
    title: "Miami vs Buffalo",
    subcategory: "Pro Football",
    ticker: "NFL-GAME",
    teams: [contract("Miami"), contract("Buffalo")],
    contracts: [contract("Miami"), contract("Buffalo")],
  };
  expect(pullMarketTitle(football)).toBe("Miami vs Buffalo");
  expect(pullOutcomeLabel(football, football.contracts[0]!)).toBe("Miami");
  expect(
    matchesPullTheme(football, { kind: "team", label: "Miami Heat" }),
  ).toBe(false);
  expect(matchesPullTheme(football, { kind: "team", label: "Miami" })).toBe(
    true,
  );
  expect(
    canonicalPullTheme({ kind: "team", label: "Miami" }, [football]),
  ).toEqual({ kind: "team", label: "Miami" });
  expect(availablePullTeams([football])).toEqual(["Buffalo", "Miami"]);
});
