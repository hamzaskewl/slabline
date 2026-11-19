"use client";
import { useEffect, useRef, useState } from "react";
import {
  demoSaleQuote,
  money,
  units,
  type Book,
  type DemoAccountView,
} from "@collectible/domain";
import { usePrivateRead } from "@/lib/use-private-read";
import { usd } from "@/lib/utils";
import { useDemoAction } from "./demo-controls";
import { SlablineMark } from "./slabline-mark";
import { Button } from "./ui/button";

const shares = (value: string) =>
  Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    useGrouping: false,
  });

export function DemoSellOrder({
  symbol,
  side,
  replay,
  rehearsal,
  book,
  stale,
}: {
  symbol: string;
  side: "yes" | "no";
  replay: boolean;
  rehearsal?: "grail";
  book: Book | null;
  stale: boolean;
}) {
  const a = useDemoAction();
  const snapshot = usePrivateRead<DemoAccountView>(
    "/api/demo",
    a.network === "devnet",
  );
  const position = snapshot.data?.positions.find(
    (p) =>
      p.symbol === symbol &&
      p.side === side &&
      p.replay === replay &&
      p.rehearsal === rehearsal &&
      p.state === "open",
  );
  const [quantity, setQuantity] = useState("0");
  const [preset, setPreset] = useState<number | null>(100);
  const [receipt, setReceipt] = useState("");
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    setQuantity(position?.quantity ?? "0");
    setPreset(100);
    key.current = crypto.randomUUID();
  }, [position?.id, position?.quantity]);
  useEffect(() => {
    setReceipt("");
  }, [symbol, side, replay, rehearsal, a.user?.id, a.network]);
  let proceeds: string | null = null,
    quoteError = "";
  const valid =
    !!position &&
    /^\d+(\.\d{1,6})?$/.test(quantity) &&
    units(quantity) > 0n &&
    units(quantity) <= units(position.quantity);
  if (valid && book && !stale && book.symbol === symbol) {
    try {
      proceeds = demoSaleQuote({ side, quantity }, book);
    } catch (error) {
      quoteError =
        error instanceof Error ? error.message : "Sale estimate unavailable.";
    }
  }
  const average =
    proceeds !== null
      ? usd(money((units(proceeds) * 1000000n) / units(quantity)))
      : "—";
  function choose(percent: number) {
    if (!position || !book) return;
    const lot = units(book.quantityIncrement);
    if (lot <= 0n) return;
    // Max retains the full executable quantity; formatting never changes an order.
    const amount =
      percent === 100
        ? units(position.quantity)
        : ((units(position.quantity) * BigInt(percent)) / 100n / lot) * lot;
    setQuantity(money(amount));
    setPreset(percent);
    setReceipt("");
    key.current = crypto.randomUUID();
  }
  return (
    <div className="sell-order">
      <div className="sell-amount">
        <label htmlFor="sell-shares">Shares</label>
        <input
          id="sell-shares"
          aria-label="Shares to sell"
          inputMode="decimal"
          autoComplete="off"
          value={preset === null ? quantity : shares(quantity)}
          disabled={a.busy || !position}
          onChange={(event) => {
            if (!/^\d*(\.\d{0,2})?$/.test(event.target.value)) return;
            setQuantity(event.target.value);
            setPreset(null);
            setReceipt("");
            key.current = crypto.randomUUID();
          }}
        />
      </div>
      <div className="sell-presets" aria-label="Shares to sell presets">
        {[25, 50, 75, 100].map((percent) => (
          <button
            key={percent}
            type="button"
            aria-pressed={preset === percent}
            disabled={a.busy || !position || !book}
            onClick={() => choose(percent)}
          >
            {percent === 100 ? "Max" : `${percent}%`}
          </button>
        ))}
      </div>
      <div className="sale-return" aria-live="polite" aria-atomic="true">
        <div>
          <span className="sale-return-label">
            You'll receive <SlablineMark height={18} />
          </span>
          <span className="sale-average">Avg. price {average}</span>
        </div>
        <strong>{proceeds === null ? "—" : usd(proceeds)}</strong>
      </div>
      <Button
        className="ticket-action trade-sell-submit"
        disabled={
          a.authenticated &&
          (a.busy || proceeds === null || !position || a.network !== "devnet")
        }
        onClick={() => {
          if (!a.authenticated) {
            a.login();
            return;
          }
          if (!position || proceeds === null) return;
          void a.run(async () => {
            await a.request({
              action: "sell",
              id: position.id,
              key: key.current,
              quantity,
              minimumProceeds: proceeds,
            });
            setReceipt("Sale complete");
            key.current = crypto.randomUUID();
          });
        }}
      >
        {!a.authenticated
          ? "Log in to sell"
          : a.busy
            ? "Selling…"
            : snapshot.isPending
              ? "Loading position…"
              : !position
                ? `No ${side === "yes" ? "Yes" : "No"} shares to sell`
                : `Sell ${side === "yes" ? "Yes" : "No"}`}
      </Button>
      {receipt && (
        <p className="sale-receipt" role="status">
          {receipt}
        </p>
      )}
      {(a.error || snapshot.error || quoteError) && (
        <p className="sale-error" role="alert">
          {a.error || snapshot.error?.message || quoteError}
        </p>
      )}
      {position && (!book || stale) && (
        <p className="sale-error" role="status">
          Waiting for live bids.
        </p>
      )}
    </div>
  );
}
