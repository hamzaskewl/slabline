"use client";

import { useState } from "react";
import Link from "next/link";
import {
  activeMarket,
  canonicalPullTheme,
  pullMarketTitle,
  marketOutcomes,
  units,
  type Market,
  type PullOpening,
  type PullTheme,
  type quoteDepth,
} from "@collectible/domain";
import { api } from "@/lib/trpc";
import { usdc } from "@/lib/utils";
import { Button } from "./ui/button";
import { usePullCatalog } from "./pull-catalog";
import type { PullActions } from "./pull-account";
import { PullMarketCards } from "./pull-market-cards";
import { PullRetry } from "./pull-board";

type Quote = ReturnType<typeof quoteDepth>;
type Side = "yes" | "no";
const allMarkets = { kind: "all" } as const;

export function PullOpeningPanel({
  opening,
  actions,
  inPresentation,
  onResume,
}: {
  opening: PullOpening;
  actions: PullActions;
  inPresentation?: boolean;
  onResume: () => void;
}) {
  return (
    <section className="pull-panel pull-stack" aria-labelledby="opening-title">
      <div className="pull-panel-heading">
        <h2 id="opening-title" tabIndex={-1}>
          {opening.state === "redeemed" ? "Position opened" : "Your pack"}
        </h2>
        <span className="pull-muted">${opening.tier} pack</span>
      </div>
      {opening.state === "pending" ? (
        <div className="pull-stack">
          <p className="pull-muted" role="status">
            Draw pending · MagicBlock VRF on Solana Devnet
          </p>
          {!inPresentation && (
            <Button
              className="pull-action"
              disabled={actions.busy}
              onClick={onResume}
            >
              View opening
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="pull-stack" role="status">
            <div>
              <div
                className={
                  opening.state === "ready"
                    ? "pull-budget pull-budget-reveal"
                    : "pull-budget"
                }
              >
                {opening.budget !== null ? usdc(opening.budget) : "—"}
              </div>
              <span className="pull-muted">
                {opening.multiplier}× pack price · Prediction budget
              </span>
            </div>
          </div>
          {opening.state === "ready" ? (
            <PullRedemption opening={opening} actions={actions} />
          ) : (
            opening.redemption && (
              <>
                <dl className="pull-facts">
                  <div>
                    <dt>Outcome</dt>
                    <dd>
                      {opening.redemption.side === "yes" ? "Yes" : "No"} ·{" "}
                      {opening.redemption.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Contracts</dt>
                    <dd>{opening.redemption.quantity}</dd>
                  </div>
                  <div>
                    <dt>Cost</dt>
                    <dd>{usdc(opening.redemption.cost)}</dd>
                  </div>
                  <div>
                    <dt>Returned to balance</dt>
                    <dd>{usdc(opening.redemption.remainder)}</dd>
                  </div>
                </dl>
                <Button variant="outline" asChild className="pull-action">
                  <Link href="/portfolio">View portfolio</Link>
                </Button>
              </>
            )
          )}
        </>
      )}
      {actions.error && (
        <p className="pull-error" role="alert">
          {actions.error}
        </p>
      )}
      {opening.proof && (
        <details className="pull-proof">
          <summary>MagicBlock VRF proof · Solana Devnet</summary>
          <p>
            <a
              href={`https://explorer.solana.com/tx/${opening.proof.requestSignature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              View request transaction
            </a>
          </p>
          <p>
            <a
              href={`https://explorer.solana.com/address/${opening.proof.requestAddress}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              View devnet receipt
            </a>
          </p>
          <p>
            <a
              href={`https://explorer.solana.com/address/${opening.proof.programId}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              View Slabline program
            </a>
          </p>
          <p>Fulfillment slot {opening.proof.slot}</p>
          <p>
            Seed <code>{opening.proof.seedHex}</code>
          </p>
          <p>
            Randomness <code>{opening.proof.randomnessHex}</code>
          </p>
        </details>
      )}
    </section>
  );
}

function PullRedemption({
  opening,
  actions,
}: {
  opening: PullOpening;
  actions: PullActions;
}) {
  const theme = canonicalPullTheme(opening.theme ?? allMarkets);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<{
    market: Market;
    symbol?: string;
    side?: Side;
  } | null>(null);
  const catalog = usePullCatalog(theme, search);
  return (
    <div className="pull-stack">
      <div className="pull-panel-heading">
        <h3>{theme.kind === "all" ? "Choose your prediction" : theme.label}</h3>
        <span className="pull-muted">Highest volume first</span>
      </div>
      <label className="pull-field">
        <span>Search unlocked markets</span>
        <input
          type="search"
          value={search}
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {selection && (
        <section
          className="pull-trade-selection"
          aria-label="Selected prediction"
        >
          <div className="pull-panel-heading">
            <h3>{pullMarketTitle(selection.market)}</h3>
            <Button
              variant="ghost"
              disabled={actions.busy}
              onClick={() => setSelection(null)}
            >
              Change market
            </Button>
          </div>
          <PullTrade
            key={`${selection.market.id}:${selection.symbol}:${selection.side}`}
            opening={opening}
            chosen={selection.market}
            initialSymbol={selection.symbol}
            initialSide={selection.side}
            actions={actions}
          />
        </section>
      )}
      {catalog.searching && (
        <p className="pull-muted" role="status">
          Finding markets…
        </p>
      )}
      {catalog.unavailable ? (
        <p className="pull-error" role="alert">
          Market catalog unavailable. Your budget is saved.
        </p>
      ) : (
        catalog.delayed && (
          <p className="pull-muted" role="status">
            Market updates delayed. Showing saved markets.
          </p>
        )
      )}
      {(catalog.unavailable || catalog.delayed) && (
        <PullRetry onClick={() => void catalog.refetch()}>
          Refresh markets
        </PullRetry>
      )}
      {!catalog.searching &&
        !catalog.unavailable &&
        catalog.markets.length === 0 && (
          <p className="pull-muted">
            No open markets match this search. Your budget is saved.{" "}
            {search && (
              <button type="button" onClick={() => setSearch("")}>
                Clear search
              </button>
            )}
          </p>
        )}
      <PullMarketCards
        key={search}
        markets={catalog.markets}
        theme={theme}
        selectedId={selection?.market.id}
        disabled={actions.busy}
        onSelect={(market, symbol, side) => {
          setSelection({ market, symbol, side });
          requestAnimationFrame(() =>
            document
              .querySelector(".pull-trade-selection")
              ?.scrollIntoView({ block: "start", behavior: "smooth" }),
          );
        }}
      />
    </div>
  );
}

function PullTrade({
  opening,
  chosen,
  actions,
  initialSymbol = "",
  initialSide = "yes",
}: {
  opening: PullOpening;
  chosen: Market;
  initialSymbol?: string;
  initialSide?: Side;
  actions: PullActions;
}) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [side, setSide] = useState<Side>(initialSide);
  const [review, setReview] = useState<{
    quote: Quote;
    eventTicker: string;
    symbol: string;
    side: Side;
  }>();
  const detail = api.market.useQuery({ id: chosen.ticker ?? chosen.id });
  const market = detail.data?.data;
  const outcomes = market
    ? marketOutcomes(market).filter((outcome) =>
        /^(active|open)$/i.test(outcome.status),
      )
    : [];
  const selected =
    outcomes.find((outcome) => outcome.symbol === symbol) ??
    (outcomes.length === 1 ? outcomes[0] : undefined);
  const eventTicker = market?.ticker;
  const ready =
    eventTicker &&
    selected &&
    market &&
    activeMarket(market) &&
    !detail.error &&
    !detail.data?.error;
  const quote =
    review &&
    review.eventTicker === eventTicker &&
    review.symbol === selected?.symbol &&
    review.side === side
      ? review.quote
      : undefined;
  const hasFill = quote && units(quote.contracts) > 0n && quote.feesVerified;

  return (
    <div className="pull-stack">
      {detail.isPending ? (
        <p className="pull-muted" role="status">
          Loading outcomes…
        </p>
      ) : !market || detail.error || detail.data?.error ? (
        <>
          <p className="pull-error" role="alert">
            Market details unavailable.
          </p>
          <PullRetry onClick={() => void detail.refetch()}>
            Refresh market
          </PullRetry>
        </>
      ) : outcomes.length === 0 ? (
        <p className="pull-muted">No open contracts. Choose another market.</p>
      ) : (
        <>
          <label className="pull-field">
            <span>Contract</span>
            <select
              value={selected?.symbol ?? ""}
              disabled={actions.busy}
              onChange={(event) => {
                setSymbol(event.target.value);
                setReview(undefined);
              }}
            >
              <option value="" disabled>
                Choose a contract
              </option>
              {outcomes.map((outcome) => (
                <option value={outcome.symbol} key={outcome.symbol}>
                  {outcome.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset disabled={actions.busy}>
            <legend>Prediction</legend>
            <div className="pull-tier-options pull-side-options">
              {(["yes", "no"] as const).map((value) => (
                <label key={value} className="pull-choice">
                  <input
                    type="radio"
                    name="pull-side"
                    checked={side === value}
                    onChange={() => {
                      setSide(value);
                      setReview(undefined);
                    }}
                  />
                  {value === "yes" ? "Yes" : "No"}
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            variant={quote ? "outline" : "default"}
            className="pull-action"
            disabled={!ready || actions.busy}
            onClick={() =>
              ready &&
              void actions.run(async () => {
                setReview(undefined);
                const result = await actions.request<{ quote: Quote }>({
                  action: "quote",
                  id: opening.id,
                  eventTicker,
                  symbol: selected.symbol,
                  side,
                });
                setReview({
                  quote: result.quote,
                  eventTicker,
                  symbol: selected.symbol,
                  side,
                });
              })
            }
          >
            {quote ? "Refresh quote" : "Review depth quote"}
          </Button>
        </>
      )}
      {quote && (
        <>
          <h3>Quote review</h3>
          <dl className="pull-facts" aria-live="polite">
            <div>
              <dt>Contracts</dt>
              <dd>{quote.contracts}</dd>
            </div>
            <div>
              <dt>Average entry</dt>
              <dd>
                {quote.averagePrice === null ? "—" : usdc(quote.averagePrice)}
              </dd>
            </div>
            <div>
              <dt>Cost before fees</dt>
              <dd>{usdc(quote.cost)}</dd>
            </div>
            <div>
              <dt>Fees</dt>
              <dd>{quote.fees === null ? "Unverified" : usdc(quote.fees)}</dd>
            </div>
            <div>
              <dt>Payout if correct</dt>
              <dd>{usdc(quote.totalPayout)}</dd>
            </div>
            <div>
              <dt>Returned to balance</dt>
              <dd>{usdc(quote.unspent)}</dd>
            </div>
          </dl>
          {!hasFill ? (
            <p className="pull-muted">
              No executable quote. Refresh or choose a different prediction.
            </p>
          ) : (
            <Button
              className="pull-action"
              disabled={!ready || actions.busy}
              onClick={() =>
                ready &&
                void actions.run(async () => {
                  setReview(undefined);
                  const result = await actions.request<{
                    opening: PullOpening;
                    balance?: string;
                  }>({
                    action: "redeem",
                    id: opening.id,
                    eventTicker,
                    symbol: selected.symbol,
                    side,
                    minimumContracts: quote.contracts,
                    maximumCost: quote.cost,
                  });
                  actions.save(result.opening, result.balance);
                })
              }
            >
              Confirm prediction
            </Button>
          )}
        </>
      )}
    </div>
  );
}
