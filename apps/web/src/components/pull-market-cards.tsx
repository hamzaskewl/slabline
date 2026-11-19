"use client";

import { useState } from "react";
import Link from "next/link";
import {
  buyPercent,
  eventVolume,
  canonicalPullTheme,
  pullMarketTitle,
  marketMatches,
  marketOutcomes,
  type PullTheme,
  type Market,
  type Contract,
} from "@collectible/domain";
import { MarketArt } from "./market-art";
import { Button } from "./ui/button";
import { api } from "@/lib/trpc";

function outcomeLabel(market: Market, outcome: Contract) {
  return market.teams?.some((team) => team.label === outcome.label)
    ? (
        canonicalPullTheme({ kind: "team", label: outcome.label }) as {
          label: string;
        }
      ).label
    : outcome.label;
}

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
  onSelect?: (market: Market, symbol?: string, side?: "yes" | "no") => void;
}) {
  const href = `/markets/${market.ticker ?? market.id}`;
  const title = pullMarketTitle(market);
  const canonical = theme && canonicalPullTheme(theme);
  const player = canonical?.kind === "player" ? canonical.label : "";
  const detail = api.market.useQuery(
    { id: market.ticker ?? market.id },
    { enabled: !!player },
  );
  const outcomes =
    player && detail.data?.data
      ? marketOutcomes(detail.data.data)
      : market.contracts;
  const displayOutcomes = player
    ? [...outcomes].sort((a, b) => {
        const matches = (contract: Contract) =>
          marketMatches(
            {
              ...market,
              title: "",
              ticker: "",
              searchText: "",
              contracts: [contract],
              children: [],
            },
            player,
          );
        return Number(matches(b)) - Number(matches(a));
      })
    : outcomes;
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
            disabled={disabled}
            onClick={() => onSelect(market)}
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
        {displayOutcomes.slice(0, 2).map((outcome) => (
          <div className="prediction-outcome" key={outcome.symbol}>
            <span className="outcome-label">
              <MarketArt market={market} outcome={outcome} />
              <span>{outcomeLabel(market, outcome)}</span>
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
                  onClick={() => onSelect(market, outcome.symbol, side)}
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
        {(market.outcomeCount ?? market.contracts.length) > 2 && (
          <span>
            +{(market.outcomeCount ?? market.contracts.length) - 2} outcomes
          </span>
        )}
      </div>
      {onSelect && !preview && (
        <Button
          variant={selected ? "default" : "outline"}
          disabled={disabled}
          aria-pressed={!!selected}
          onClick={() => onSelect(market)}
        >
          {selected ? "Selected market" : "Choose market"}
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
  onSelect?: (market: Market, symbol?: string, side?: "yes" | "no") => void;
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
