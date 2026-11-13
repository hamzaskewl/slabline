import { expect, test } from "bun:test";
import {
  collectMarketPages,
  normalizeCandles,
  readPriceHistory,
  CandleRequestError,
} from "./gemini";
import { marketPreview } from "@collectible/domain";

test("new contracts fall back to real minute candles, while outages stay errors", async () => {
  const requests: string[] = [];
  const history = await readPriceHistory(
    "GEMI-TEST-YES",
    "ALL",
    async (frame) => {
      requests.push(frame);
      if (frame === "1day") throw new CandleRequestError(400);
      return [[1800000000000, 0.2, 0.3, 0.2, 0.25, 10]];
    },
  );
  expect(requests).toEqual(["1day", "1m"]);
  expect(history.intervalSeconds).toBe(60);
  expect(history.points).toEqual([{ time: 1800000000, value: 0.25 }]);
  await expect(
    readPriceHistory("GEMI-TEST-YES", "ALL", async () => {
      throw new CandleRequestError(503);
    }),
  ).rejects.toThrow("503");
});

test("catalog walks past 100 and 500, retaining nested and unpriced markets", async () => {
  const requests: number[] = [];
  const data = Array.from({ length: 1007 }, (_, i) => ({
    id: String(i),
    title: `Event ${i}`,
    category: "Sports",
    status: "active",
    contracts: [
      {
        instrumentSymbol: `GEMI-${i}-YES`,
        prices: { lastTradePrice: null, bestAsk: null },
      },
    ],
    ...(i === 1006
      ? {
          events: [
            { id: "nested", title: "Nested sports market", contracts: [] },
          ],
        }
      : {}),
  }));
  const result = await collectMarketPages(async (offset, limit) => {
    requests.push(offset);
    return {
      data: data.slice(offset, offset + limit),
      pagination: { total: data.length },
    };
  });
  expect(requests).toEqual(Array.from({ length: 11 }, (_, i) => i * 100));
  expect(result).toHaveLength(1007);
  expect(result.at(-1)?.children[0]?.id).toBe("nested");
  expect(result.at(-1)?.contracts[0]?.lastPrice).toBeNull();
  const full = result.at(-1)!;
  full.children[0]!.contracts = Array.from({ length: 30 }, (_, i) => ({
    ...full.contracts[0]!,
    symbol: `GEMI-CHILD-${i}`,
    label: `Player ${i}`,
  }));
  const preview = marketPreview(full);
  expect(preview.contracts).toHaveLength(2);
  expect(preview.outcomeCount).toBe(31);
  expect(preview.searchText).toContain("player 29");
  expect(full.children[0]!.contracts).toHaveLength(30);
});

test("failed later pages never masquerade as a complete catalog", async () => {
  const first = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    title: "Event",
  }));
  await expect(
    collectMarketPages(async (offset) => {
      if (offset) throw new Error("provider timeout");
      return { data: first, pagination: { total: 900 } };
    }),
  ).rejects.toThrow("provider timeout");
  await expect(
    collectMarketPages(async () => ({ data: [], pagination: { total: 900 } })),
  ).rejects.toThrow("Incomplete");
});

test("history sorts real candle closes and rejects impossible prices", () => {
  const raw = [
    [1800000120000, 0.1, 0.3, 0.1, 0.25, 10],
    [1800000000000, 0.1, 0.2, 0.1, 0.15, 10],
    [1800000120000, 0.1, 0.3, 0.1, 0.26, 12],
    [1800000180000, 1, 2, 1, 1.06, 2],
  ];
  const history = normalizeCandles(raw, "GEMI-TEST-YES", "1D");
  expect(history.points).toEqual([
    { time: 1800000000, value: 0.15 },
    { time: 1800000120, value: 0.26 },
  ]);
  expect(history.intervalSeconds).toBe(60);
  expect(() =>
    normalizeCandles({ error: "outage" }, "GEMI-TEST-YES", "ALL"),
  ).toThrow();
  expect(normalizeCandles([], "GEMI-TEST-YES", "ALL").points).toEqual([]);
});
