"use client";

import { useState } from "react";
import Link from "next/link";
import {
  pullOutcomeLabel,
  pullMarketTitle,
  marketOutcomes,
  units,
  type Market,
  type PullOpening,
  type PullTheme,
  type quoteDepth,
} from "@collectible/domain";
import { useQuery } from "@tanstack/react-query";
import { Layers3, Coins, Trophy } from "lucide-react";
import { MarketArt } from "./market-art";
import { UsdcAmount } from "./usdc-amount";
import { usdc, number } from "@/lib/utils";
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
            <PullRedemption
              key={opening.id}
              opening={opening}
              actions={actions}
            />
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
                    <dt>Shares</dt>
                    <dd>{number(opening.redemption.quantity)}</dd>
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
  const theme = opening.theme ?? allMarkets;
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<{
    market: Market;
    symbol: string;
    side: Side;
  } | null>(null);
  const catalog = usePullCatalog(theme, search);
  if (selection)
    return (
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
    );
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

export function PullTrade({
  opening,
  chosen,
  actions,
  initialSymbol,
  initialSide = "yes",
}: {
  opening: PullOpening;
  chosen: Market;
  initialSymbol: string;
  initialSide?: Side;
  actions: PullActions;
}) {
  const [side, setSide] = useState<Side>(initialSide);
  const selected = marketOutcomes(chosen).find(
    (outcome) => outcome.symbol === initialSymbol,
  );
  const eventTicker = chosen.ticker ?? chosen.id;
  const request = { id: opening.id, eventTicker, symbol: initialSymbol, side };
  const preview = useQuery({
    queryKey: ["pull-prediction", opening.id, initialSymbol, side],
    enabled: !!selected && !actions.busy,
    queryFn: () =>
      actions.request<{ quote: Quote }>({ action: "quote", ...request }),
    retry: 2,
    retryDelay: 1000,
    staleTime: 10000,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const quote = preview.data?.quote;
  const hasFill =
    !!quote &&
    units(quote.contracts) > 0n &&
    quote.feesVerified &&
    !preview.error;
  if (!selected)
    return (
      <p className="pull-error" role="alert">
        Choose a prediction from a market card.
      </p>
    );
  const label = pullOutcomeLabel(chosen, selected);
  return (
    <div className="pull-stack">
      <div className="pull-selected-outcome">
        <MarketArt market={chosen} outcome={selected} />
        <strong>{label}</strong>
      </div>
      <fieldset disabled={actions.busy}>
        <legend>Prediction</legend>
        <div className="pull-tier-options pull-side-options">
          {(["yes", "no"] as const).map((value) => (
            <label key={value} className="pull-choice">
              <input
                type="radio"
                name={`pull-side-${opening.id}`}
                checked={side === value}
                onChange={() => setSide(value)}
              />
              {value === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      </fieldset>
      <h3>Confirm prediction</h3>
      {preview.isPending && (
        <p className="pull-muted" role="status">
          Loading prediction…
        </p>
      )}
      {preview.error && (
        <div role="alert">
          <p className="pull-error">{preview.error.message}</p>
          <PullRetry onClick={() => void preview.refetch()}>
            Try again
          </PullRetry>
        </div>
      )}
      {quote && (
        <dl className="pull-facts pull-confirmation-facts" aria-live="polite">
          <div>
            <dt>
              <Layers3 size={16} aria-hidden="true" /> Shares
            </dt>
            <dd>{number(quote.contracts)}</dd>
          </div>
          <div>
            <dt>
              <Coins size={16} aria-hidden="true" /> Cost
            </dt>
            <dd>
              <UsdcAmount value={quote.cost} />
            </dd>
          </div>
          <div>
            <dt>
              <Trophy size={16} aria-hidden="true" /> If correct
            </dt>
            <dd>
              <UsdcAmount value={quote.totalPayout} />
            </dd>
          </div>
        </dl>
      )}
      {quote && !hasFill && !preview.error && (
        <p className="pull-muted">
          No shares are available at this price. Choose another prediction.
        </p>
      )}
      <Button
        className="pull-action"
        disabled={!hasFill || actions.busy || preview.isFetching}
        onClick={() => {
          if (!quote || !hasFill) return;
          void actions.run(async () => {
            try {
              const result = await actions.request<{
                opening: PullOpening;
                balance?: string;
              }>({
                action: "redeem",
                ...request,
                minimumContracts: quote.contracts,
                maximumCost: quote.cost,
              });
              actions.save(result.opening, result.balance);
            } catch (error) {
              void preview.refetch();
              throw error;
            }
          });
        }}
      >
        {actions.busy
          ? "Confirming…"
          : `Confirm ${side === "yes" ? "Yes" : "No"}`}
      </Button>
    </div>
  );
}
