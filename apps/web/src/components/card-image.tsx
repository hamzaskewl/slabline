"use client";
import Image from "next/image";
import { canOptimizeCardImage } from "@/lib/card-images";
import { useState } from "react";
import { ImageOff, LoaderCircle } from "lucide-react";

/** A URL change mounts a fresh image, so the previous card can never linger. */
export function CardImage({
  src,
  alt,
  className = "",
  eager = false,
  sizes = "256px",
}: {
  src?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
  sizes?: string;
}) {
  return (
    <ImageContent
      key={src ?? "missing"}
      src={src}
      alt={alt}
      className={className}
      eager={eager}
      sizes={sizes}
    />
  );
}
function ImageContent({
  src,
  alt,
  className,
  eager,
  sizes,
}: {
  src?: string | null;
  alt: string;
  className: string;
  eager: boolean;
  sizes: string;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "error">(
    src ? "loading" : "error",
  );
  const [original, setOriginal] = useState(false);
  const optimized = !!src && canOptimizeCardImage(src) && !original;
  const imageProps = {
    alt,
    loading: eager ? ("eager" as const) : ("lazy" as const),
    fetchPriority: eager ? ("high" as const) : ("auto" as const),
    decoding: "async" as const,
    referrerPolicy: "no-referrer" as const,
    onLoad: () => setState("loaded"),
    onError: () => {
      // Provider formats or temporary optimizer failures can still use the
      // original. Retry only once, and never keep the previous card visible.
      if (optimized) setOriginal(true);
      else setState("error");
    },
  };
  return (
    <span className={`card-media ${className}`} data-state={state}>
      {src &&
        state !== "error" &&
        (optimized ? (
          <Image src={src} fill sizes={sizes} {...imageProps} />
        ) : (
          <img src={src} {...imageProps} />
        ))}
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
