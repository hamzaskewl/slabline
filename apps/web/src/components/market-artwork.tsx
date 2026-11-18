"use client";
import { useState } from "react";

/** Missing artwork leaves the adjacent name as plain text. */
export function MarketArtwork({
  src,
  className = "",
}: {
  src: string | null | undefined;
  label: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return null;
  return (
    <span className={`market-artwork ${className}`} aria-hidden="true">
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
    </span>
  );
}
