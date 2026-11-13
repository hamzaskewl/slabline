export type ChartRange = "1D" | "1W" | "1M" | "ALL";
export type PricePoint = { time: number; value: number };
export type PriceHistory = {
  symbol: string;
  range: ChartRange;
  intervalSeconds: number;
  points: PricePoint[];
};

export const historyIntervals: Record<ChartRange, number> = {
  "1D": 60,
  "1W": 300,
  "1M": 1800,
  ALL: 86400,
};

// Provider timestamps are candle starts, not invented observations at page-load time.
export function normalizePricePoints(points: PricePoint[]): PricePoint[] {
  const valid = points.filter(
    (p) =>
      Number.isSafeInteger(p.time) &&
      p.time > 0 &&
      Number.isFinite(p.value) &&
      p.value >= 0 &&
      p.value <= 1,
  );
  return [...new Map(valid.map((p) => [p.time, p])).values()].sort(
    (a, b) => a.time - b.time,
  );
}

export function appendTrade(
  history: PriceHistory,
  trade: PricePoint | null,
): PricePoint[] {
  if (!trade || !normalizePricePoints([trade]).length) return history.points;
  const time =
    Math.floor(trade.time / history.intervalSeconds) * history.intervalSeconds;
  const last = history.points.at(-1);
  if (last && time < last.time) return history.points;
  return normalizePricePoints([
    ...history.points,
    { time, value: trade.value },
  ]);
}
