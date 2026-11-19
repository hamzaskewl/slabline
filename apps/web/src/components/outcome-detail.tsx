"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ChartRange, Contract } from "@collectible/domain";
import { useLiveBook, type LiveBookState } from "@/lib/use-live-book";
import { OrderBook } from "./order-book";

const PriceChart = dynamic(() => import("./price-chart"), {
  ssr: false,
  loading: () => <div className="chart-loading">Loading chart…</div>,
});

export function OutcomeDetail({
  outcome,
  practice,
  shared,
  id,
}: {
  outcome: Contract & { color: string };
  practice: boolean;
  shared: LiveBookState;
  id: string;
}) {
  const [view, setView] = useState<"book" | "graph">("book");
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [range, setRange] = useState<ChartRange>("ALL");
  const own = useLiveBook(
    shared.symbol === outcome.symbol ? undefined : outcome.symbol,
    practice,
  );
  const live = shared.symbol === outcome.symbol ? shared : own;
  const outcomes = useMemo(() => [outcome], [outcome]);
  return (
    <section
      id={id}
      className="outcome-detail"
      aria-label={`${outcome.label} details`}
    >
      <div className="outcome-detail-tabs" aria-label={`${outcome.label} view`}>
        <button aria-pressed={view === "book"} onClick={() => setView("book")}>
          Order book
        </button>
        <button
          aria-pressed={view === "graph"}
          onClick={() => setView("graph")}
        >
          Graph
        </button>
      </div>
      {view === "book" ? (
        <OrderBook
          book={live.book}
          label={outcome.label}
          side={side}
          onSide={setSide}
          lastPrice={
            live.latestTrade
              ? live.latestTrade.value.toFixed(2)
              : outcome.lastPrice
          }
          stale={live.stale}
          error={live.streamError}
          practice={practice}
        />
      ) : practice ? (
        <p className="ob-empty">No trade history for this simulated market.</p>
      ) : (
        <PriceChart
          outcomes={outcomes}
          eventTime={null}
          range={range}
          onRangeChange={setRange}
          latestTrade={live.latestTrade}
          compact
        />
      )}
    </section>
  );
}
