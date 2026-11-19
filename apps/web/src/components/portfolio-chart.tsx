"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import { UsdcAmount } from "./usdc-amount";
import { usd } from "@/lib/utils";
const ranges = ["1D", "1W", "1M", "ALL"] as const;
const emptyHistory: { time: string; value: string }[] = [];
export function PortfolioChart({
  history = emptyHistory,
  currentValue,
}: {
  history?: { time: string; value: string }[];
  currentValue?: string;
}) {
  const [range, setRange] = useState<(typeof ranges)[number]>("1D"),
    [hover, setHover] = useState<{ value: number; time: string } | null>(null);
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
          .filter(
            (p) =>
              Date.parse(p.time) >= now - duration &&
              Number.isFinite(Number(p.value)),
          )
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
        background: { type: ColorType.Solid, color: "#151E28" },
        textColor: "#a7adb3",
        fontFamily: "Inter Variable, sans-serif",
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: {
        visible: false,
        scaleMargins: { top: 0.15, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: range === "1D",
        fixLeftEdge: true,
        fixRightEdge: true,
      },
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
      lastValueVisible: false,
    });
    series.setData(points);
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((p) => {
      const row = p.seriesData.get(series);
      setHover(
        row && "value" in row
          ? {
              value: row.value,
              time:
                typeof p.time === "number"
                  ? new Date(p.time * 1000).toLocaleString()
                  : "",
            }
          : null,
      );
    });
    return () => chart.remove();
  }, [points, range]);
  return (
    <div className="portfolio-chart">
      <div className="portfolio-chart-toolbar">
        <span>Balance history</span>
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
      <div className="portfolio-chart-readout" aria-live="polite">
        <strong>
          {hover ? (
            <UsdcAmount value={hover.value} />
          ) : currentValue === undefined ? (
            "—"
          ) : (
            <UsdcAmount value={currentValue} />
          )}
        </strong>
        {hover?.time && <span>{hover.time}</span>}
      </div>
      <div className="portfolio-chart-plot">
        <img
          className="slabline-chart-watermark"
          src="/brand/slabline-chart-watermark.svg"
          width={40}
          height={56}
          alt=""
          aria-hidden="true"
        />
        <div
          className="portfolio-chart-canvas"
          ref={host}
          hidden={points.length < 2}
        />
        {points.length < 2 &&
          (currentValue === undefined ? (
            <div className="portfolio-chart-loading" role="status">
              Loading balance…
            </div>
          ) : (
            <svg
              className="portfolio-balance-line"
              viewBox="0 0 640 160"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Current balance ${usd(currentValue)}. History is not available yet.`}
            >
              <path
                d="M 0 80 H 640"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ))}
      </div>
    </div>
  );
}
