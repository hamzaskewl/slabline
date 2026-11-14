"use client";
import { useState } from "react";
import { ExternalLink, Layers3 } from "lucide-react";
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
      <a
        className="card-image-well"
        href={token.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`View ${token.name} on Grail`}
      >
        <span className="grade-badge">{token.chain}</span>
        {token.image && !failed ? (
          <img
            src={token.image}
            alt={token.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <Layers3 size={36} />
        )}
      </a>
      <div className="card-information">
        <span className="card-category">Grail token · {token.symbol}</span>
        <h3>{token.name}</h3>
        <p>{token.tags.filter((t) => t !== "WTM").join(" · ")}</p>
        <a
          className="grail-action"
          href={token.url}
          target="_blank"
          rel="noreferrer"
        >
          View on Grail <ExternalLink size={14} />
        </a>
        <details className="token-details">
          <summary>Token details</summary>
          <p>
            {token.chain} · Chain {token.chainId}
          </p>
          <code>{token.address}</code>
          <p>
            Fractional token. Physical redemption depends on Grail’s
            requirements and available inventory.
          </p>
        </details>
      </div>
    </article>
  );
}
