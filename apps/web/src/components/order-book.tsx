"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import {
  bookForSide,
  bookSpread,
  cents,
  depthRows,
  sidePrice,
  units,
  type Book,
  type DepthRow,
} from "@collectible/domain";

const shares = (value: string) =>
  Number(value).toLocaleString("en-US", { maximumFractionDigits: 6 });
const dollars = (value: string) =>
  Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function OrderBook({
  book,
  label,
  side,
  onSide,
  lastPrice,
  stale,
  error,
  practice,
}: {
  book: Book | null;
  label: string;
  side: "yes" | "no";
  onSide: (side: "yes" | "no") => void;
  lastPrice: string | null;
  stale: boolean;
  error: string | null;
  practice: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const [totalMode, setTotalMode] = useState("usd");
  const asksRef = useRef<HTMLDivElement>(null);
  const bidsRef = useRef<HTMLDivElement>(null);
  const tick = book?.priceIncrement ?? "0.01";
  const groups = [
    ...new Set(
      [tick, "0.01", "0.05", "0.10"].filter(
        (value) =>
          units(value) >= units(tick) && units(value) % units(tick) === 0n,
      ),
    ),
  ];
  const increment = group && groups.includes(group) ? group : tick;
  const depth = useMemo(() => {
    if (!book) return null;
    try {
      const selected = bookForSide(book, side);
      return {
        asks: depthRows(selected.asks, "asks", increment),
        bids: depthRows(selected.bids, "bids", increment),
        spread: bookSpread(selected),
      };
    } catch {
      return null;
    }
  }, [book, side, increment]);
  const hasDepth = !!(depth?.asks.length || depth?.bids.length);
  function recenter() {
    if (asksRef.current)
      asksRef.current.scrollTop = asksRef.current.scrollHeight;
    if (bidsRef.current) bidsRef.current.scrollTop = 0;
  }
  useEffect(() => {
    recenter();
  }, [open, book?.symbol, side, increment, hasDepth]);
  const last = sidePrice(lastPrice, side);
  function rows(levels: DepthRow[], kind: "asks" | "bids") {
    const max = Number(levels.at(-1)?.totalShares ?? 1);
    return (kind === "asks" ? [...levels].reverse() : levels).map((row) => (
      <div className={`ob-row ob-${kind}`} role="row" key={row.price}>
        <span
          className="ob-depth"
          aria-hidden="true"
          style={{
            width: `${Math.min(100, (Number(row.totalShares) / max) * 100)}%`,
          }}
        />
        <span role="cell" className="ob-price">
          {row.minPrice === row.maxPrice
            ? cents(row.minPrice, tick)
            : `${cents(row.minPrice, tick).replace("¢", "")}–${cents(row.maxPrice, tick)}`}
        </span>
        <span role="cell">{shares(row.quantity)}</span>
        <span
          role="cell"
          title={`${shares(row.totalShares)} cumulative shares · ${dollars(row.totalValue)} cumulative value`}
        >
          {totalMode === "usd"
            ? dollars(row.totalValue)
            : shares(row.totalShares)}
        </span>
      </div>
    ));
  }
  return (
    <details
      className="ob-disclosure"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        Order book{" "}
        <span className={book && !stale ? "ob-live" : ""}>
          {practice
            ? "Simulated"
            : book && !stale
              ? "Live"
              : book || error
                ? "Reconnecting"
                : "Loading"}
        </span>
      </summary>
      <div className="ob-controls">
        <div className="ob-selection">
          <span>{label}</span>
          <div className="ob-sides" aria-label="Order book side">
            {(["yes", "no"] as const).map((s) => (
              <button
                key={s}
                aria-pressed={s === side}
                onClick={() => onSide(s)}
              >
                {s === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>
        <div className="ob-tools">
          <label>
            <span className="sr-only">Price grouping</span>
            <select
              value={increment}
              onChange={(e) => setGroup(e.target.value)}
            >
              {groups.map((value) => (
                <option key={value} value={value}>
                  {cents(value, value)}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={recenter}
            aria-label="Recenter order book"
            title="Recenter order book"
          >
            <LocateFixed size={18} />
          </button>
        </div>
      </div>
      {(error || stale) && (
        <p className="ob-status" role="status">
          {error ?? "Reconnecting. Displayed depth may be out of date."}
        </p>
      )}
      <div
        className={`ob-table${stale ? " ob-stale" : ""}`}
        role="table"
        aria-label={`${label} ${side.toUpperCase()} order book`}
      >
        <div className="ob-row ob-head" role="row">
          <span role="columnheader">Price</span>
          <span role="columnheader">Shares</span>
          <span role="columnheader">
            <select
              aria-label="Cumulative total unit"
              value={totalMode}
              onChange={(e) => setTotalMode(e.target.value)}
            >
              <option value="usd">Total (USD)</option>
              <option value="shares">Total (shares)</option>
            </select>
          </span>
        </div>
        <div className="ob-side-label ob-ask-label">
          Asks <span>Sell orders</span>
        </div>
        <div
          className="ob-scroll ob-ask-scroll"
          ref={asksRef}
          role="rowgroup"
          tabIndex={0}
          aria-label="Ask depth, best ask at bottom"
        >
          {depth?.asks.length ? (
            rows(depth.asks, "asks")
          ) : (
            <p className="ob-empty">
              {book ? "No asks available" : "Loading asks…"}
            </p>
          )}
        </div>
        <div className="ob-mid" aria-label="Last trade and spread">
          <span>
            Last <strong>{cents(last, tick)}</strong>
          </span>
          <span>
            Spread{" "}
            <strong>{!stale && depth ? cents(depth.spread, tick) : "—"}</strong>
          </span>
        </div>
        <div
          className="ob-scroll"
          ref={bidsRef}
          role="rowgroup"
          tabIndex={0}
          aria-label="Bid depth, best bid at top"
        >
          {depth?.bids.length ? (
            rows(depth.bids, "bids")
          ) : (
            <p className="ob-empty">
              {book ? "No bids available" : "Loading bids…"}
            </p>
          )}
        </div>
        <div className="ob-side-label ob-bid-label">
          Bids <span>Buy orders</span>
        </div>
      </div>
      <p className="ob-footnote">
        Totals accumulate from the best price. Scroll each side to see more
        depth.
      </p>
    </details>
  );
}
