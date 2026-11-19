import { expect, test } from "bun:test";
import {
  currentFmv,
  fmvComparison,
  filterCards,
  DEMO_REPLAY_CARD,
  type Valuation,
  type RewardFilters,
} from "./index";

const now = Date.now();
const valuation = (
  fmv = "100",
  expiresAt = new Date(now + 3600000).toISOString(),
): Valuation => ({
  fmv,
  expiresAt,
  observedAt: new Date(now).toISOString(),
  providerId: "verified-card",
  confidence: "exact",
  methodology: "Recent comparable sales",
  comps: [],
});

test("FMV comparison treats inclusive 10% and 25% boundaries consistently", () => {
  for (const ask of ["25", "90", "100", "110"])
    expect(fmvComparison(valuation(), ask, now).tone).toBe("green");
  expect(fmvComparison(valuation(), "110.01", now).tone).toBe("amber");
  expect(fmvComparison(valuation(), "125", now).tone).toBe("amber");
  expect(fmvComparison(valuation(), "125.01", now).tone).toBe("red");
  expect(fmvComparison(valuation(), "75", now).difference).toBe(-25);
});

test("missing, expired and malformed FMVs never imply a bargain", () => {
  for (const estimate of [
    null,
    valuation("0"),
    valuation("NaN"),
    valuation("Infinity"),
    valuation("-10"),
    valuation("100", "invalid"),
    valuation("100", new Date(now).toISOString()),
  ]) {
    expect(currentFmv(estimate, now)).toBeNull();
    expect(fmvComparison(estimate, "100", now)).toEqual({
      value: null,
      tone: "neutral",
      difference: null,
    });
  }
  // Owned cards have an estimate, but no current listing price to compare.
  for (const ask of [undefined, "0", "-1", "Infinity", "invalid"])
    expect(fmvComparison(valuation(), ask, now)).toEqual({
      value: 100,
      tone: "neutral",
      difference: null,
    });
});

test("reward FMV sorting ranks estimates instead of asking prices, with unknowns last", () => {
  const cards = [
    {
      ...DEMO_REPLAY_CARD,
      mint: "unknown",
      name: "Unknown",
      ask: "1000000",
      valuation: null,
    },
    {
      ...DEMO_REPLAY_CARD,
      mint: "lower",
      name: "Lower",
      ask: "5000",
      valuation: valuation("80"),
    },
    {
      ...DEMO_REPLAY_CARD,
      mint: "highest",
      name: "Highest",
      ask: "10",
      valuation: valuation("1000"),
    },
    {
      ...DEMO_REPLAY_CARD,
      mint: "expired",
      name: "Expired",
      ask: "100",
      valuation: valuation("100000", new Date(now - 60000).toISOString()),
    },
    {
      ...DEMO_REPLAY_CARD,
      mint: "same",
      name: "Another",
      ask: "200",
      valuation: valuation("80"),
    },
  ];
  const filters: RewardFilters = {
    search: "",
    category: "",
    grader: "",
    grade: "",
    min: "",
    max: "",
    feature: "",
    sort: "fmv",
  };
  expect(filterCards(cards, filters).map((c) => c.mint)).toEqual([
    "highest",
    "same",
    "lower",
    "expired",
    "unknown",
  ]);
  expect(
    filterCards(cards, { ...filters, max: "300" }).map((c) => c.mint),
  ).toEqual(["highest", "same", "expired"]);
  expect(filterCards(cards, { ...filters, sort: "high" })[0]!.mint).toBe(
    "unknown",
  );
  expect(cards[0]!.mint).toBe("unknown");
});
