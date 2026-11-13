"use client";
import { useEffect, useRef, useState } from "react";
import {
  LineSeries,
  createChart,
  ColorType,
  CrosshairMode,
  LastPriceAnimationMode,
  type UTCTimestamp,
} from "lightweight-charts";
import type { ChartRange, PricePoint } from "@collectible/domain";
import { createPriceSeries } from "@/lib/price-series";

const percent = (value: number) =>
  value < 0 || value > 1 ? "" : `${Math.round(value * 100)}%`;
export default function PriceChart({
  points,
  range,
  onRangeChange,
  loading,
  error,
  retry,
}: {
  points: PricePoint[];
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const render = useRef<ReturnType<typeof createPriceSeries> | null>(null);
  const [hover, setHover] = useState<{ time: number; value: number } | null>(
    null,
  );
  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#080b0e" },
        textColor: "#9ca3aa",
        fontFamily: "Inter Variable",
        fontSize: 12,
        attributionLogo: true,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.06, bottom: 0.04 },
        minimumWidth: 48,
      },
      timeScale: {
        borderColor: "#34383c",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: false,
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      localization: { priceFormatter: percent },
    });
    const series = chart.addSeries(LineSeries, {
      color: "#229dca",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      lastPriceAnimation: LastPriceAnimationMode.Continuous,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: "#229dca",
      crosshairMarkerBackgroundColor: "#080b0e",
      priceFormat: { type: "custom", minMove: 0.01, formatter: percent },
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: 0, maxValue: 1 },
      }),
    });
    render.current = createPriceSeries({
      setData: (data) =>
        series.setData(
          data.map((p) => ({ ...p, time: p.time as UTCTimestamp })),
        ),
      update: (p) => series.update({ ...p, time: p.time as UTCTimestamp }),
      fit: () => chart.timeScale().fitContent(),
    });
    chart.subscribeCrosshairMove((event) => {
      const point = event.seriesData.get(series);
      if (
        event.time &&
        typeof event.time === "number" &&
        point &&
        "value" in point
      )
        setHover({ time: event.time, value: point.value });
      else setHover(null);
    });
    return () => {
      render.current = null;
      chart.remove();
    };
  }, []);
  useEffect(() => {
    render.current?.(points, range);
    setHover(null);
  }, [points, range]);
  return (
    <div className="market-chart">
      <div
        className="chart-wrap"
        aria-label="Gemini YES probability history"
        data-range={range}
        data-point-count={points.length}
      >
        <div ref={host} className="chart-canvas" />
        {hover ? (
          <div className="chart-tooltip">
            <strong>{percent(hover.value)}</strong>
            <span>
              {new Date(hover.time * 1000).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        ) : null}
        {!points.length ? (
          <div className="chart-empty" role="status">
            {loading
              ? "Loading price history…"
              : error
                ? "Price history unavailable"
                : "No trades yet"}
            <span>
              {loading
                ? "Gemini public market data"
                : error
                  ? "Retry to load Gemini’s recorded prices."
                  : "A chart appears when Gemini reports price history."}
            </span>
            {error ? (
              <button className="chart-retry" onClick={retry}>
                Retry history
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="chart-controls">
        <span className="chart-source" role="status">
          {error && points.length
            ? "History refresh unavailable"
            : "Gemini · YES price history"}
        </span>
        <div className="chart-ranges" aria-label="Chart time range">
          {(["1D", "1W", "1M", "ALL"] as const).map((r) => (
            <button
              key={r}
              aria-pressed={range === r}
              onClick={() => onRangeChange(r)}
            >
              {r === "ALL" ? "All" : r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
