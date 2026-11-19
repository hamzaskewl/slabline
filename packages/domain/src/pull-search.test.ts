import { expect, test } from "bun:test";
import {
  availablePullTeams,
  canonicalPullTheme,
  matchesPullTheme,
  pullSearchQuery,
  marketPreview,
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
