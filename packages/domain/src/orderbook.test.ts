import { expect, test } from "bun:test";
import {
  bookForSide,
  bookSpread,
  cents,
  depthRows,
  quoteDepth,
  sidePrice,
  payoutTarget,
  type Book,
} from "./index";

const targetBook: Book = {
  symbol: "GEMI-TEST",
  source: "gemini",
  updatedAt: "2026-11-14T00:00:00Z",
  stale: false,
  bids: [{ price: "0.37", quantity: "500" }],
  asks: [
    { price: "0.38", quantity: "357" },
    { price: "0.39", quantity: "200" },
  ],
  quantityIncrement: "0.01",
  priceIncrement: "0.01",
  quantityMinimum: "0.01",
  priceMinimum: "0.01",
  quoteAssetPrecision: 2,
};
test("a 125 dollar gross target costs 47.50 at actual 38 cent depth", () => {
  expect(payoutTarget("125", targetBook, "yes")).toEqual({
    sharesNeeded: "125.000000",
    availableShares: "557.000000",
    stake: "47.500000",
    averagePrice: "0.380000",
  });
  const higher = payoutTarget("400", targetBook, "yes");
  expect(higher.stake).toBe("152.430000");
  expect(higher.averagePrice).toBe("0.381075");
});
test("target estimates respect lots, NO inversion, stale data and insufficient depth", () => {
  expect(
    payoutTarget(
      "125.01",
      { ...targetBook, quantityIncrement: "1", quantityMinimum: "1" },
      "yes",
    ).sharesNeeded,
  ).toBe("126.000000");
  expect(payoutTarget("125", targetBook, "no").stake).toBe("78.750000");
  expect(payoutTarget("600", targetBook, "yes").stake).toBeNull();
  expect(
    payoutTarget("125", { ...targetBook, stale: true }, "yes").stake,
  ).toBeNull();
  expect(
    payoutTarget("125", { ...targetBook, asks: [] }, "yes").stake,
  ).toBeNull();
});

test("depth totals accumulate from the best price, preserving ungrouped notional", () => {
  const asks = [
    { price: "0.109", quantity: "20" },
    { price: "0.101", quantity: "10" },
    { price: "0.12", quantity: "5" },
  ];
  const rows = depthRows(asks, "asks", "0.01");
  expect(rows).toEqual([
    {
      price: "0.110000",
      minPrice: "0.101000",
      maxPrice: "0.109000",
      quantity: "30.000000",
      totalShares: "30.000000",
      totalValue: "3.190000",
    },
    {
      price: "0.120000",
      minPrice: "0.120000",
      maxPrice: "0.120000",
      quantity: "5.000000",
      totalShares: "35.000000",
      totalValue: "3.790000",
    },
  ]);
  expect(depthRows(asks, "bids", "0.01").map((row) => row.price)).toEqual([
    "0.120000",
    "0.100000",
  ]);
  expect(
    depthRows([{ price: "0.001", quantity: "0.001" }], "asks", "0.001")[0]
      ?.totalValue,
  ).toBe("0.000001");
});

test("NO book inverts both sides and last trade, preserving the actual spread", () => {
  const yes = {
    asks: [{ price: "0.62", quantity: "20" }],
    bids: [{ price: "0.59", quantity: "40" }],
  };
  const no = bookForSide(yes, "no");
  expect(no.asks).toEqual([{ price: "0.410000", quantity: "40" }]);
  expect(no.bids).toEqual([{ price: "0.380000", quantity: "20" }]);
  expect(bookSpread(yes)).toBe("0.030000");
  expect(bookSpread(no)).toBe("0.030000");
  expect(sidePrice("0.61", "no")).toBe("0.390000");
  expect(sidePrice(null, "no")).toBeNull();
  expect(bookSpread({ ...yes, bids: [] })).toBeNull();
  expect(
    bookSpread({ ...yes, bids: [{ price: "0.70", quantity: "1" }] }),
  ).toBeNull();
});

test("native cents precision and fractional-cent weighted averages", () => {
  expect(cents("0.62", "0.01")).toBe("62¢");
  expect(cents("0.621", "0.001")).toBe("62.1¢");
  expect(cents("0.6212", "0.0001")).toBe("62.12¢");
  expect(cents("0.625", "0.01", true)).toBe("62.5¢");
  expect(cents(null)).toBe("—");
});

test("a larger stake walks depth and raises the weighted average, excluding fees", () => {
  const input = {
    asks: [
      { price: "0.40", quantity: "100" },
      { price: "0.80", quantity: "1000" },
    ],
    quantityIncrement: "1",
    feeBps: null,
  };
  expect(quoteDepth({ ...input, stake: "20" }).averagePrice).toBe("0.400000");
  const larger = quoteDepth({ ...input, stake: "300" });
  expect(larger.contracts).toBe("425.000000");
  expect(larger.averagePrice).toBe("0.705882");
  expect(larger.exhausted).toBe(false);
  const empty = quoteDepth({ ...input, asks: [], stake: "300" });
  expect(empty.averagePrice).toBeNull();
  const exhausted = quoteDepth({ ...input, stake: "1000" });
  expect(exhausted.contracts).toBe("1100.000000");
  expect(exhausted.exhausted).toBe(true);
  expect(exhausted.unspent).toBe("160.000000");
  expect(
    quoteDepth({ ...input, stake: "300", feeBps: 100 }).averagePrice,
  ).not.toBeNull();
});

test("display retains every available depth level, beyond the old 100-level limit", () => {
  const levels = Array.from({ length: 150 }, (_, i) => ({
    price: ((i + 1) / 1000).toFixed(3),
    quantity: "1",
  }));
  const rows = depthRows(levels, "asks", "0.001");
  expect(rows).toHaveLength(150);
  expect(rows.at(-1)?.totalShares).toBe("150.000000");
  expect(() => depthRows(levels, "asks", "0")).toThrow();
});
