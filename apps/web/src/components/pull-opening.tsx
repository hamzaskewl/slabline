"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  activeMarket,
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
import { PullRetry } from "./pull-board";

const PullRandomness = dynamic(
  () => import("./pull-randomness").then((module) => module.PullRandomness),
  {
    loading: () => (
      <p className="pull-muted" role="status">
        Loading the saved devnet draw…
      </p>
    ),
  },
);

type Quote = ReturnType<typeof quoteDepth>;
type Side = "yes" | "no";
const allMarkets = { kind: "all" } as const;

export function PullOpeningPanel({
  opening,
  actions,
}: {
  opening: PullOpening;
  actions: PullActions;
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
        <PullRandomness opening={opening} actions={actions} />
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
                    <dt>Demo cost</dt>
                    <dd>{usdc(opening.redemption.cost)}</dd>
                  </div>
                  <div>
                    <dt>Returned to demo cash</dt>
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
      {!opening.proof && opening.randomnessSource === "demo-csprng" && (
        <p className="pull-muted">Practice draw using server randomness.</p>
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
  const [theme, setTheme] = useState<PullTheme>(opening.theme ?? allMarkets);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<Market | null>(null);
  const catalog = usePullCatalog(theme, search);
  return (
    <div className="pull-stack">
      <h3>Choose a market and outcome</h3>
      {theme.kind !== "all" ? (
        <div className="pull-panel-heading">
          <span className="pull-muted">{theme.label}</span>
          <PullRetry
            onClick={() => {
              setChosen(null);
              setTheme(allMarkets);
            }}
          >
            Show all markets
          </PullRetry>
        </div>
      ) : (
        <label className="pull-field">
          <span>Find a market</span>
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      )}
      <label className="pull-field">
        <span>Market</span>
        <select
          value={chosen?.id ?? ""}
          disabled={actions.busy}
          onChange={(event) =>
            setChosen(
              catalog.markets.find(
                (market) => market.id === event.target.value,
              ) ?? null,
            )
          }
        >
          <option value="">Select a market</option>
          {chosen &&
            !catalog.markets.some((market) => market.id === chosen.id) && (
              <option value={chosen.id}>{chosen.title}</option>
            )}
          {catalog.markets.map((market) => (
            <option key={market.id} value={market.id}>
              {market.title}
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <p className="pull-muted pull-selected-title">{chosen.title}</p>
      )}
      {catalog.searching ? (
        <p className="pull-muted" role="status">
          Checking markets…
        </p>
      ) : null}
      {catalog.error || catalog.data?.error ? (
        <>
          <p className="pull-error" role="alert">
            Market catalog unavailable.
          </p>
          <PullRetry onClick={() => void catalog.refetch()}>
            Refresh markets
          </PullRetry>
        </>
      ) : (
        !catalog.searching &&
        catalog.markets.length === 0 && (
          <p className="pull-muted">
            No matching markets. Try a broader search to use your saved budget.
          </p>
        )
      )}
      {chosen && (
        <PullTrade
          key={chosen.id}
          opening={opening}
          chosen={chosen}
          actions={actions}
        />
      )}
    </div>
  );
}

function PullTrade({
  opening,
  chosen,
  actions,
}: {
  opening: PullOpening;
  chosen: Market;
  actions: PullActions;
}) {
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<Side>("yes");
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
              <dt>Returned to demo cash</dt>
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
              Confirm demo position
            </Button>
          )}
        </>
      )}
    </div>
  );
}
