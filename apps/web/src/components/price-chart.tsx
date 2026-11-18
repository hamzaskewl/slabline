"use client";
import { useEffect, useRef, useState } from "react";
import {
  LineSeries,
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  appendTrade,
  buyPercent,
  eventVolume,
  type Contract,
  type ChartRange,
  type PricePoint,
} from "@collectible/domain";
import { createPriceSeries } from "@/lib/price-series";
import { api } from "@/lib/trpc";

type Outcome = Contract & { color: string };
const percent = (n: number) =>
  n < 0 || n > 1 ? "" : Math.round(n * 100) + "%";
type Trace = {
  series: ISeriesApi<"Line">;
  render: ReturnType<typeof createPriceSeries>;
  points: PricePoint[];
  key: string;
  color: string;
};
export default function PriceChart({
  outcomes,
  volume,
  eventTime,
  range,
  onRangeChange,
  latestTrade,
  compact = false,
}: {
  outcomes: Outcome[];
  volume?: string | null;
  eventTime: string | null;
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  latestTrade: (PricePoint & { symbol: string }) | null;
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    chartRef = useRef<IChartApi | null>(null),
    traces = useRef(new Map<string, Trace>());
  const [hover, setHover] = useState<{
    time: number;
    values: Record<string, number>;
  } | null>(null);
  const queries = api.useQueries((t) =>
    outcomes.map((o) =>
      t.history(
        { symbol: o.symbol, range },
        { staleTime: 15000, refetchInterval: 30000 },
      ),
    ),
  );
  const datasets = outcomes.map((o, i) => {
    const q = queries[i],
      h = q?.data?.data;
    const points =
      h?.symbol === o.symbol && h.range === range
        ? appendTrade(h, latestTrade?.symbol === o.symbol ? latestTrade : null)
        : [];
    return {
      o,
      points,
      loading: q?.isLoading,
      error: q?.error || q?.data?.error,
    };
  });
  const count = datasets.reduce((n, d) => n + d.points.length, 0);
  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#010304" },
        textColor: "#93999d",
        fontFamily: "Inter Variable, Arial, sans-serif",
        fontSize: 12,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.09, bottom: 0.09 },
        minimumWidth: 43,
      },
      timeScale: {
        borderColor: "#22272b",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 1,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScale: false,
      handleScroll: false,
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#7f858a",
          width: 1,
          style: LineStyle.Dotted,
          labelVisible: false,
        },
        horzLine: { visible: false, labelVisible: false },
      },
      localization: { priceFormatter: percent },
    });
    chartRef.current = chart;
    chart.subscribeCrosshairMove((e) => {
      if (typeof e.time !== "number" || !e.point) {
        setHover(null);
        return;
      }
      const values: Record<string, number> = {};
      for (const [symbol, t] of traces.current) {
        const p = e.seriesData.get(t.series);
        if (p && "value" in p) values[symbol] = p.value;
      }
      setHover({ time: e.time, values });
    });
    return () => {
      traces.current.clear();
      chartRef.current = null;
      chart.remove();
    };
  }, []);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const [id, t] of traces.current)
      if (!outcomes.some((o) => o.symbol === id)) {
        chart.removeSeries(t.series);
        traces.current.delete(id);
      }
    for (const { o, points } of datasets) {
      let t = traces.current.get(o.symbol);
      if (!t) {
        const series = chart.addSeries(LineSeries, {
          color: o.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerRadius: 4,
          priceFormat: { type: "custom", minMove: 0.001, formatter: percent },
        });
        t = {
          series,
          points: [],
          key: "",
          color: o.color,
          render: createPriceSeries({
            setData: (p) =>
              series.setData(
                p.map((v) => ({ ...v, time: v.time as UTCTimestamp })),
              ),
            update: (p) =>
              series.update({ ...p, time: p.time as UTCTimestamp }),
            fit: () => chart.timeScale().fitContent(),
          }),
        };
        traces.current.set(o.symbol, t);
      }
      if (t.color !== o.color) {
        t.series.applyOptions({ color: o.color });
        t.color = o.color;
      }
      if (
        t.key === range &&
        (t.points === points ||
          (points.length === t.points.length &&
            points.every(
              (p, i) =>
                p.time === t!.points[i]?.time &&
                p.value === t!.points[i]?.value,
            )))
      )
        continue;
      t.series.applyOptions({
        pointMarkersVisible: points.length === 1,
        pointMarkersRadius: 3,
      });
      t.render(points, range);
      t.key = range;
      t.points = points;
    }
  });
  const loading = datasets.some((d) => d.loading),
    error = datasets.some((d) => d.error);
  const missing = datasets.filter((d) => !d.points.length && !d.loading);
  const failed = missing.filter((d) => d.error);
  const empty = missing.filter((d) => !d.error);
  return (
    <div className="market-chart">
      <div className="outcome-legend" aria-label="Charted outcomes">
        {datasets.map(({ o, points, loading, error }) => (
          <div
            key={o.symbol}
            title={
              o.label +
              (loading
                ? " · Loading history"
                : error
                  ? " · History unavailable"
                  : !points.length
                    ? " · No recorded trades in this range"
                    : "")
            }
          >
            <i style={{ background: o.color }} />
            <span>{o.label}</span>
            <b>
              {hover
                ? hover.values[o.symbol] != null
                  ? percent(hover.values[o.symbol]!)
                  : "—"
                : buyPercent(o.buyYes)}
            </b>
          </div>
        ))}
      </div>
      <div
        className="chart-wrap"
        aria-label="Gemini outcome price histories"
        data-range={range}
        data-series-count={datasets.filter((d) => d.points.length).length}
        data-point-count={count}
      >
        <div ref={host} className="chart-canvas" />
        {hover && count > 0 && (
          <time className="chart-tooltip">
            {new Date(hover.time * 1000).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        )}
        {!count && (
          <div className="chart-empty" role="status">
            {loading
              ? "Loading market history…"
              : error
                ? "Price history unavailable"
                : "No recorded trades in this range"}
            {error && (
              <button
                className="chart-retry"
                onClick={() => queries.forEach((q) => void q.refetch())}
              >
                Retry history
              </button>
            )}
          </div>
        )}
      </div>
      <div className="chart-controls">
        {!compact && (
          <div className="chart-meta">
            {eventTime && (
              <time dateTime={eventTime}>
                {new Date(eventTime).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </time>
            )}
            <strong className="chart-volume">{eventVolume(volume)}</strong>
          </div>
        )}
        <div className="chart-ranges" aria-label="Chart time range">
          {(["1D", "1W", "1M", "ALL"] as const).map((r) => (
            <button
              key={r}
              aria-pressed={range === r}
              onClick={() => {
                setHover(null);
                onRangeChange(r);
              }}
            >
              {r === "ALL" ? "All" : r}
            </button>
          ))}
        </div>
      </div>
      {count > 0 && failed.length > 0 && (
        <div className="missing-history" role="status">
          History unavailable for {failed.map((d) => d.o.label).join(", ")}.
        </div>
      )}
      {count > 0 && empty.length > 0 && (
        <div className="missing-history" role="status">
          No recorded trades in this range for{" "}
          {empty.map((d) => d.o.label).join(", ")}.
        </div>
      )}
    </div>
  );
}
