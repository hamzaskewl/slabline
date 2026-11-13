import { expect, test } from "bun:test";
import { appendTrade, type PriceHistory } from "./history";

test("trades update the current candle without fabricating history or moving it backward", () => {
  const history: PriceHistory = {
    symbol: "GEMI-TEST-YES",
    range: "1D",
    intervalSeconds: 60,
    points: [{ time: 1800000000, value: 0.25 }],
  };
  expect(appendTrade(history, null)).toEqual(history.points);
  expect(appendTrade(history, { time: 1800000030, value: 0.3 })).toEqual([
    { time: 1800000000, value: 0.3 },
  ]);
  expect(appendTrade(history, { time: 1800000061, value: 0.4 })).toEqual([
    ...history.points,
    { time: 1800000060, value: 0.4 },
  ]);
  expect(appendTrade(history, { time: 1799999900, value: 0.4 })).toEqual(
    history.points,
  );
  expect(appendTrade(history, { time: 1800000061, value: 1.06 })).toEqual(
    history.points,
  );
});
