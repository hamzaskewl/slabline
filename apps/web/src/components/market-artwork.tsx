"use client";
import { useState } from "react";

/** Artwork comes from the normalized event/contract, never a guessed team match. */
export function MarketArtwork({
  src,
  label,
  className = "",
}: {
  src: string | null | undefined;
  label: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const initials = label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return (
    <span className={`market-artwork ${className}`} aria-hidden="true">
      {src && failed !== src ? (
        <img
          src={src}
          alt=""
          width={64}
          height={64}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
        />
      ) : (
        <span className="market-artwork-fallback">{initials}</span>
      )}
    </span>
  );
}
