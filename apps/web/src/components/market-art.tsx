"use client";
import { useState } from "react";
import { Layers3 } from "lucide-react";
import {
  marketTeams,
  outcomeImages,
  type Contract,
  type Market,
} from "@collectible/domain";

function ProviderImage({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="image-initial" title={label}>
      {label.slice(0, 2)}
    </span>
  ) : (
    <img
      src={src}
      alt={label}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
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
        images.map((i) => <ProviderImage key={i.src} {...i} />)
      ) : (
        <Layers3 size={22} aria-hidden="true" />
      )}
    </span>
  );
}
