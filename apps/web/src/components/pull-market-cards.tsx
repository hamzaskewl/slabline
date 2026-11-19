"use client";

import { useState } from "react";
import Link from "next/link";
import {
  buyPercent,
  eventVolume,
  pullOutcomeLabel,
  pullMarketTitle,
  pullThemeOutcomes,
  type PullTheme,
  type Market,
} from "@collectible/domain";
import { MarketArt } from "./market-art";
import { Button } from "./ui/button";
import { api } from "@/lib/trpc";

export function PullMarketCard({
  market,
  selected,
  onSelect,
  disabled,
  preview = false,
  theme,
}: {
  market: Market;
  selected?: boolean;
  disabled?: boolean;
  preview?: boolean;
  theme?: PullTheme;
  onSelect?: (market: Market, symbol: string, side: "yes" | "no") => void;
}) {
  const href = `/markets/${market.ticker ?? market.id}`;
  const title = pullMarketTitle(market);
  const canonical = theme ?? ({ kind: "all" } as const);
  const [expanded, setExpanded] = useState(false);
  const needsDetail =
    (market.outcomeCount ?? market.contracts.length) > market.contracts.length;
  const detail = api.market.useQuery(
    { id: market.ticker ?? market.id },
    { enabled: needsDetail, staleTime: 30000 },
  );
  const full = detail.data?.data ?? market;
  const displayOutcomes = pullThemeOutcomes(full, canonical);
  const loading = needsDetail && !detail.data?.data && detail.isPending;
  const visible = expanded ? displayOutcomes : displayOutcomes.slice(0, 2);
  const choose = () => {
    if (displayOutcomes.length === 1)
      onSelect?.(full, displayOutcomes[0]!.symbol, "yes");
    else setExpanded(true);
  };
  return (
    <article
      className="prediction-card pull-market-card"
      data-selected={selected || undefined}
    >
      <div className="prediction-card-heading">
        <span className="prediction-card-image">
          <MarketArt market={market} />
        </span>
        {preview ? (
          <span className="prediction-card-title">{title}</span>
        ) : onSelect ? (
          <button
            type="button"
            className="prediction-card-title"
            disabled={disabled || loading || !displayOutcomes.length}
            onClick={choose}
          >
            {title}
          </button>
        ) : (
          <Link className="prediction-card-title" href={href}>
            {title}
          </Link>
        )}
      </div>
      <div className="prediction-outcomes">
        {visible.map((outcome) => (
          <div className="prediction-outcome" key={outcome.symbol}>
            <span className="outcome-label">
              <MarketArt market={market} outcome={outcome} />
              <span>{pullOutcomeLabel(full, outcome)}</span>
            </span>
            {(["yes", "no"] as const).map((side) => {
              const label = `${side === "yes" ? "Yes" : "No"} ${buyPercent(side === "yes" ? outcome.buyYes : outcome.buyNo)}`;
              return preview ? (
                <span className={`outcome-${side}`} key={side}>
                  {label}
                </span>
              ) : onSelect ? (
                <button
                  type="button"
                  key={side}
                  className={`outcome-${side}`}
                  disabled={disabled}
                  aria-label={`${outcome.label}: ${label}`}
                  onClick={() => onSelect(full, outcome.symbol, side)}
                >
                  {label}
                </button>
              ) : (
                <Link
                  key={side}
                  className={`outcome-${side}`}
                  href={`${href}?contract=${encodeURIComponent(outcome.symbol)}&side=${side}`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="prediction-card-footer">
        <span className="card-volume">{eventVolume(market.volume)}</span>
        <span className="card-category">
          {market.subcategory ?? market.category}
        </span>
        {!expanded && displayOutcomes.length > 2 && (
          <button
            type="button"
            className="text-button"
            onClick={() => setExpanded(true)}
          >
            +{displayOutcomes.length - 2} predictions
          </button>
        )}
      </div>
      {loading && (
        <p className="pull-muted" role="status">
          Loading matching predictions…
        </p>
      )}
      {!loading && !displayOutcomes.length && (
        <p className="pull-muted">No open prediction for this selection.</p>
      )}
      {onSelect && !preview && (
        <Button
          variant={selected ? "default" : "outline"}
          disabled={disabled || loading || !displayOutcomes.length}
          aria-pressed={!!selected}
          onClick={choose}
        >
          {selected
            ? "Selected prediction"
            : displayOutcomes.length === 1
              ? "Choose prediction"
              : "Show all predictions"}
        </Button>
      )}
    </article>
  );
}

export function PullMarketCards({
  markets,
  selectedId,
  onSelect,
  disabled,
  theme,
}: {
  markets: Market[];
  selectedId?: string;
  disabled?: boolean;
  theme?: PullTheme;
  onSelect?: (market: Market, symbol: string, side: "yes" | "no") => void;
}) {
  const [limit, setLimit] = useState(5);
  return (
    <div className="pull-market-list">
      {markets.slice(0, limit).map((market) => (
        <PullMarketCard
          key={market.id}
          market={market}
          theme={theme}
          selected={selectedId === market.id}
          onSelect={onSelect}
          disabled={disabled}
        />
      ))}
      {markets.length > limit && (
        <Button
          variant="outline"
          onClick={() => setLimit((value) => value + 5)}
        >
          Show more markets
        </Button>
      )}
    </div>
  );
}
