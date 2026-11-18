"use client";
import {
  marketTeams,
  outcomeImages,
  type Contract,
  type Market,
} from "@collectible/domain";
import { MarketArtwork } from "./market-artwork";

/** Reuse the provider artwork component, including its contained images and fallback. */
export function MarketArt({
  market,
  outcome,
}: {
  market: Market;
  outcome?: Contract;
}) {
  const teams = marketTeams(market);
  const images = outcome
    ? outcomeImages(market, outcome)
    : teams.length
      ? teams.flatMap((t) =>
          t.imageUrl ? [{ src: t.imageUrl, label: t.label }] : [],
        )
      : market.imageUrl
        ? [{ src: market.imageUrl, label: market.title }]
        : [];
  if (outcome && !images.length) return null;
  return (
    <span className={`market-art ${images.length > 1 ? "team-pair" : ""}`}>
      {images.length ? (
        images.map((i) => <MarketArtwork key={i.src} {...i} />)
      ) : (
        <MarketArtwork src={null} label={market.title} />
      )}
    </span>
  );
}
