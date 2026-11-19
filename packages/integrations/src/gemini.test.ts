import { expect, test } from "bun:test";
import { ApiError, SdkError, createClient } from "@gemini-markets/sdk/server";
import {
  collectMarketPages,
  collectMarketCategories,
  normalizeCandles,
  readPriceHistory,
  CandleRequestError,
  normalizeEvent,
  safeImage,
} from "./gemini";
import {
  marketPreview,
  marketOutcomes,
  eventVolume,
  buyPercent,
} from "@collectible/domain";

test("Gemini championship outcomes retain the provider's Contentful team artwork", () => {
  const buffalo =
    "https://images.ctfassets.net/jg6lo9a2ukvr/zbZpcrxpSCQKQmcRYUDA6/728742e6d361d7bdc46863d79545d911/Buffalo_BillsDark.png";
  const jacksonville =
    "https://images.ctfassets.net/jg6lo9a2ukvr/2bUDmtRSikBpCAMSTMxE9I/1e1f0eb88005a02e25bd903de99bcc86/Jacksonville_JaguarsDark.png";
  const market = normalizeEvent({
    id: "champion",
    title: "2027 Pro Football Champion",
    category: "Sports",
    contracts: [
      {
        instrumentSymbol: "GEMI-PROFB2027-BUFFALO",
        label: "Buffalo",
        imageUrl: buffalo,
      },
      {
        instrumentSymbol: "GEMI-PROFB2027-JACKSONVILLE",
        label: "Jacksonville",
        imageUrl: jacksonville,
      },
    ],
  });
  expect(marketPreview(market).contracts.map((c) => c.imageUrl)).toEqual([
    buffalo,
    jacksonville,
  ]);
  expect(safeImage(buffalo.replace("https:", "http:"))).toBeNull();
  expect(
    safeImage(
      buffalo.replace(
        "images.ctfassets.net",
        "images.ctfassets.net.attacker.test",
      ),
    ),
  ).toBeNull();
  expect(
    safeImage(buffalo.replace("jg6lo9a2ukvr", "unrelated-space")),
  ).toBeNull();
});

test("league feeds recover active MVP futures omitted by the broad Sports catalog", async () => {
  const calls: string[] = [];
  const game = {
    id: "game",
    title: "Boston vs Denver",
    category: "Sports",
    subcategory: { name: "Pro Football" },
  };
  const result = await collectMarketCategories(
    ["Sports", "Live"],
    async (category) => {
      calls.push(category!);
      const data =
        category === "Pro Football"
          ? [
              game,
              {
                id: "mvp",
                title: "Pro Football MVP Winner",
                category: "Sports",
                subcategory: { name: "Pro Football" },
              },
            ]
          : [game];
      return { data, pagination: { total: data.length } };
    },
  );
  expect(result.map((m) => m.id)).toEqual(["game", "mvp"]);
  expect(calls.filter((c) => c === "Pro Football")).toHaveLength(1);
  await expect(
    collectMarketCategories(["Sports"], async (category) => {
      if (category === "Pro Football") throw new Error("League unavailable");
      return { data: [game], pagination: { total: 1 } };
    }),
  ).rejects.toThrow("League unavailable");
});

test("an ask is never presented as a last trade", () => {
  const market = normalizeEvent({
    id: "test",
    title: "Test",
    contracts: [
      {
        instrumentSymbol: "GEMI-TEST-YES",
        prices: { bestAsk: "0.62", lastTradePrice: null },
      },
    ],
  });
  expect(market.contracts[0]?.lastPrice).toBeNull();
});

test("new contracts fall back to real minute candles, while outages stay errors", async () => {
  const requests: string[] = [];
  const history = await readPriceHistory(
    "GEMI-TEST-YES",
    "ALL",
    async (frame) => {
      requests.push(frame);
      if (frame === "1day") throw new CandleRequestError(400, "NoDataFound");
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

test("Gemini NoDataFound is empty history at every range, not a provider outage", async () => {
  for (const range of ["1D", "1W", "1M", "ALL"] as const) {
    const requests: string[] = [];
    const history = await readPriceHistory(
      "GEMI-TEST-YES",
      range,
      async (frame) => {
        requests.push(frame);
        if (frame === "1day") throw new CandleRequestError(400, "NoDataFound");
        throw ApiError.fromResponse({
          status: 400,
          body: { reason: "NoDataFound", message: "Candles are empty" },
        });
      },
    );
    expect(history.points).toEqual([]);
    expect(history.intervalSeconds).toBe(60);
    expect(requests.at(-1)).toBe("1m");
    expect(requests).toHaveLength(range === "1D" ? 1 : 2);
  }
});

test("empty coarse candles recover real minute data; invalid symbols and outages stay errors", async () => {
  const requests: string[] = [];
  const history = await readPriceHistory(
    "GEMI-TEST-YES",
    "1W",
    async (frame) => {
      requests.push(frame);
      if (frame === "5m")
        throw ApiError.fromResponse({
          status: 400,
          body: { reason: "NoDataFound" },
        });
      return [[1800000000000, 0.2, 0.3, 0.2, 0.25, 10]];
    },
  );
  expect(requests).toEqual(["5m", "1m"]);
  expect(history.points).toEqual([{ time: 1800000000, value: 0.25 }]);
  for (const status of [400, 404, 429, 503]) {
    const error = ApiError.fromResponse({
      status,
      body: { reason: "InvalidSymbol" },
    });
    await expect(
      readPriceHistory("GEMI-TEST-YES", "ALL", async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    await expect(
      readPriceHistory("GEMI-TEST-YES", "ALL", async () => {
        throw new CandleRequestError(status, "InvalidSymbol");
      }),
    ).rejects.toThrow(String(status));
  }
});

test("catalog shrinks actual SDK response-limit failures without skipping events", async () => {
  const calls: number[][] = [];
  const client = await createClient({
    env: "production",
    skipWsInit: true,
    maxRetries: 0,
    maxResponseSizeBytes: 2048,
    fetch: async (url) => {
      const params = new URL(url).searchParams;
      const offset = Number(params.get("offset")),
        limit = Number(params.get("limit"));
      calls.push([offset, limit]);
      return new Response(
        JSON.stringify({
          data: Array.from(
            { length: Math.min(limit, 173 - offset) },
            (_, i) => ({
              id: String(offset + i),
              title: "Nested sports event with provider metadata",
            }),
          ),
          pagination: { total: 173 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    },
  });
  const markets = await collectMarketPages((offset, limit) =>
    client.predictions.listEvents({ offset, limit }),
  );
  expect(calls.slice(0, 3)).toEqual([
    [0, 100],
    [0, 50],
    [0, 25],
  ]);
  expect(markets.map((m) => m.id)).toEqual(
    Array.from({ length: 173 }, (_, i) => String(i)),
  );
});

test("an unreadable single event stops pagination instead of looping or publishing a partial catalog", async () => {
  const limits: number[] = [];
  await expect(
    collectMarketPages(async (_offset, limit) => {
      limits.push(limit);
      throw new SdkError(
        "HTTP response exceeded the configured 16777216-byte limit",
      );
    }),
  ).rejects.toThrow("byte limit");
  expect(limits).toEqual([100, 50, 25, 12, 6, 3, 1]);
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

test("a timed out catalog page retries from the same offset with smaller pages", async () => {
  const calls: number[][] = [];
  const markets = await collectMarketPages(async (offset, limit) => {
    calls.push([offset, limit]);
    if (offset === 100 && limit === 100)
      throw Object.assign(new Error("deadline"), {
        name: "RequestTimeoutError",
      });
    const data = Array.from(
      { length: Math.min(limit, 173 - offset) },
      (_, i) => ({ id: String(offset + i), title: "Market" }),
    );
    return { data, pagination: { total: 173 } };
  });
  expect(calls).toEqual([
    [0, 100],
    [100, 100],
    [100, 50],
    [150, 50],
  ]);
  expect(markets).toHaveLength(173);
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

test("the outcome board preserves the two-sided spread, missing prices, provider colors and nested selections", async () => {
  const [m] = await collectMarketPages(async () => ({
    data: [
      {
        id: "e",
        title: "Final",
        volume: "4403",
        liquidity: "250.50",
        createdAt: "2026-11-01T00:00:00Z",
        contracts: [
          {
            instrumentSymbol: "GEMI-A",
            label: "A",
            color: "#0f9ee7",
            prices: { buy: { yes: "0.88", no: "0.17" } },
          },
          { instrumentSymbol: "GEMI-B", label: "B", color: "#0f9ee7" },
          { instrumentSymbol: "GEMI-C", label: "C", color: "#0f9ee7" },
        ],
        events: [
          {
            id: "p",
            title: "Team total over 100",
            contracts: [
              { instrumentSymbol: "GEMI-P", label: "Yes", color: "#007AC1" },
            ],
          },
        ],
      },
    ],
    pagination: { total: 1 },
  }));
  const rows = marketOutcomes(m!);
  expect(rows.map((c) => c.color)).toEqual([
    "#0f9ee7",
    "#005cf0",
    "#fb6832",
    "#007ac1",
  ]);
  expect(rows.map((c) => c.label)).toEqual([
    "A",
    "B",
    "C",
    "Team total over 100",
  ]);
  expect([buyPercent(rows[0]?.buyYes), buyPercent(rows[0]?.buyNo)]).toEqual([
    "88%",
    "17%",
  ]);
  expect(buyPercent(rows[1]?.buyNo)).toBe("—");
  expect(eventVolume(m!.volume)).toBe("$4,403 vol.");
  expect(m!.liquidity).toBe("250.50");
  expect(marketPreview(m!).createdAt).toBe("2026-11-01T00:00:00Z");
  expect(eventVolume(null)).toBe("Volume unavailable");
  expect(eventVolume("0")).toBe("$0 vol.");
  expect(marketPreview(m!).contracts[1]?.symbol).toBe("GEMI-B");
});

test("range controls exclude trades older than the selected window", async () => {
  const now = Date.UTC(2026, 10, 13, 12);
  const raw = [10, 5, 0].map((days) => [
    now - days * 86400000,
    0.2,
    0.2,
    0.2,
    0.2,
    1,
  ]);
  for (const [range, expected] of [
    ["1D", 1],
    ["1W", 2],
    ["1M", 3],
    ["ALL", 3],
  ] as const) {
    expect(
      (await readPriceHistory("GEMI-TEST-YES", range, async () => raw, now))
        .points,
    ).toHaveLength(expected);
  }
});
