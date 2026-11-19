"use client";
import { useState } from "react";
import { ImageOff, LoaderCircle } from "lucide-react";

/** A URL change mounts a fresh image, so the previous card can never linger. */
export function CardImage({
  src,
  alt,
  className = "",
  eager = false,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <ImageContent
      key={src ?? "missing"}
      src={src}
      alt={alt}
      className={className}
      eager={eager}
    />
  );
}
function ImageContent({
  src,
  alt,
  className,
  eager,
}: {
  src?: string | null;
  alt: string;
  className: string;
  eager: boolean;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "error">(
    src ? "loading" : "error",
  );
  return (
    <span className={`card-media ${className}`} data-state={state}>
      {src && state !== "error" && (
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
        />
      )}
      {state !== "loaded" && (
        <span
          className="card-media-placeholder"
          role="img"
          aria-label={
            state === "loading"
              ? `Loading ${alt}`
              : `Image unavailable for ${alt}`
          }
        >
          {state === "loading" ? (
            <LoaderCircle size={22} className="spin" aria-hidden="true" />
          ) : (
            <ImageOff size={22} aria-hidden="true" />
          )}
          <span>
            {state === "loading" ? "Loading image" : "Image unavailable"}
          </span>
        </span>
      )}
    </span>
  );
}
