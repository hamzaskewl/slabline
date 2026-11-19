"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import { usd } from "@/lib/utils";
const ranges = ["1D", "1W", "1M", "ALL"] as const;
export function PortfolioChart({
  history = [],
}: {
  history?: { time: string; value: string }[];
}) {
  const [range, setRange] = useState<(typeof ranges)[number]>("1D"),
    [hover, setHover] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const points = useMemo(() => {
    const now = Date.now(),
      duration =
        range === "1D"
          ? 86400000
          : range === "1W"
            ? 7 * 86400000
            : range === "1M"
              ? 30 * 86400000
              : Infinity;
    return [
      ...new Map(
        history
          .filter((p) => Date.parse(p.time) >= now - duration)
          .map((p) => [
            Math.floor(Date.parse(p.time) / 1000),
            {
              time: Math.floor(Date.parse(p.time) / 1000) as UTCTimestamp,
              value: Number(p.value),
            },
          ]),
      ).values(),
    ].sort((a, b) => a.time - b.time);
  }, [history, range]);
  useEffect(() => {
    if (!host.current || points.length < 2) return;
    const chart = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#15181b" },
        textColor: "#a7adb3",
        fontFamily: "Inter Variable, sans-serif",
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: "#24292d" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: range === "1D" },
      handleScale: false,
      handleScroll: false,
      localization: { priceFormatter: (v: number) => usd(v) },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: "#64b5f6",
      topColor: "rgba(100,181,246,.16)",
      bottomColor: "rgba(100,181,246,0)",
      lineWidth: 2,
      priceLineVisible: false,
    });
    series.setData(points);
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((p) => {
      const row = p.seriesData.get(series);
      setHover(
        row && "value" in row
          ? `${usd(row.value)} · ${typeof p.time === "number" ? new Date(p.time * 1000).toLocaleString() : ""}`
          : null,
      );
    });
    return () => chart.remove();
  }, [points, range]);
  return (
    <div className="portfolio-chart">
      <div className="portfolio-chart-toolbar">
        <span aria-live="polite">
          {hover ?? "Account value history · at cost"}
        </span>
        <div className="chart-ranges" aria-label="Portfolio chart period">
          {ranges.map((r) => (
            <button
              key={r}
              aria-pressed={r === range}
              onClick={() => {
                setRange(r);
                setHover(null);
              }}
            >
              {r === "ALL" ? "All" : r}
            </button>
          ))}
        </div>
      </div>
      <div className="portfolio-chart-canvas" ref={host} />
      {points.length < 2 && (
        <p className="portfolio-chart-empty">
          {history.length
            ? "Your history starts here. New activity will appear on this chart."
            : "Your account history will appear here."}
        </p>
      )}
    </div>
  );
}
