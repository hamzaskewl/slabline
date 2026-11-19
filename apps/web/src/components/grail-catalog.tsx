"use client";
import Link from "next/link";
import { CardImage } from "./card-image";
import { useState } from "react";
import { ArrowRight, Layers3 } from "lucide-react";
import type { GrailToken } from "@collectible/domain";

export function GrailCatalog({ tokens }: { tokens: GrailToken[] }) {
  return (
    <div className="collectible-grid grail-grid">
      {tokens.map((token) => (
        <GrailTile key={token.id} token={token} />
      ))}
    </div>
  );
}
function GrailTile({ token }: { token: GrailToken }) {
  const [failed, setFailed] = useState(false);
  return (
    <article className="collectible-tile grail-tile">
      <Link
        className="card-image-well"
        href={`/tokens/${token.chainId}/${token.address}`}
        aria-label={`View ${token.name}`}
      >
        <span className="grade-badge">{token.chain}</span>
        <CardImage src={token.image} alt={token.name} />
      </Link>
      <div className="card-information">
        <span className="card-category">Grail token · {token.symbol}</span>
        <h3>{token.name}</h3>
        <p>{token.tags.filter((t) => t !== "WTM").join(" · ")}</p>
        <Link
          className="grail-action"
          href={`/tokens/${token.chainId}/${token.address}`}
        >
          View token <ArrowRight size={14} />
        </Link>
        <details className="token-details">
          <summary>Token details</summary>
          <p>
            {token.chain} · Chain {token.chainId}
          </p>
          <code>{token.address}</code>
        </details>
      </div>
    </article>
  );
}
