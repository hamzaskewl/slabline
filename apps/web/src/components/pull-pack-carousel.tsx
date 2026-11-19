"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SlablineMark } from "./slabline-mark";
import type { PullTier } from "@collectible/domain";

export const packCount = 5;
const arc = 360 / packCount;

function packArt(tier: PullTier) {
  return `/packs/pull-${tier}.webp`;
}

export function PullPackFace({
  tier,
  index,
}: {
  tier: PullTier;
  index?: number;
}) {
  return (
    <>
      <img
        src={packArt(tier)}
        alt=""
        draggable={false}
        width={240}
        height={360}
      />
      <span className="pull-pack-print">
        <SlablineMark height={18} />
        <strong>${tier}</strong>
      </span>
      {index !== undefined && (
        <span className="pull-pack-index">
          {String(index + 1).padStart(2, "0")}
        </span>
      )}
    </>
  );
}

export function PullPackCarousel({
  tier,
  disabled,
  rotation,
  onTurn,
}: {
  tier: PullTier;
  disabled: boolean;
  rotation: number;
  onTurn: (step: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const carousel = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; dx: number } | null>(null);
  const active = ((rotation % packCount) + packCount) % packCount;

  function turn(step: number) {
    if (!disabled) onTurn(step);
  }

  function select(index: number) {
    const distance = (index - active + packCount) % packCount;
    turn(distance > packCount / 2 ? distance - packCount : distance);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!gesture.current) return;
    const dx = event.clientX - gesture.current.x;
    if (Math.abs(dx) < 7 && !dragging) return;
    gesture.current.dx = dx;
    if (!event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    carousel.current?.style.setProperty(
      "--drag",
      `${Math.min(68, Math.max(-68, dx / 2))}deg`,
    );
  }

  function finish(cancelled = false) {
    if (!gesture.current) return;
    const { dx } = gesture.current;
    gesture.current = null;
    setDragging(false);
    carousel.current?.style.removeProperty("--drag");
    if (!cancelled && Math.abs(dx) > 30) turn(dx > 0 ? -1 : 1);
  }

  return (
    <div className="pull-carrousel" role="group" aria-label="Pack artwork">
      <div
        ref={carousel}
        className="pull-ring-stage"
        data-dragging={dragging || undefined}
        style={{ "--rotation": `${rotation * -arc}deg` } as CSSProperties}
        onPointerDown={(event) => {
          if (disabled || !event.isPrimary || event.button !== 0) return;
          gesture.current = { x: event.clientX, dx: 0 };
        }}
        onPointerMove={move}
        onPointerUp={() => finish()}
        onPointerCancel={() => finish(true)}
        onPointerLeave={() => {
          if (!dragging) finish(true);
        }}
        onLostPointerCapture={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          turn(event.key === "ArrowLeft" ? -1 : 1);
        }}
      >
        <div className="pull-ring" aria-hidden="true">
          {Array.from({ length: packCount }, (_, index) => (
            <div
              className="pull-ring-slot"
              key={index}
              style={
                {
                  "--slot": `${index * arc}deg`,
                  "--foil": `${(index - 2) * 5}deg`,
                } as CSSProperties
              }
            >
              <div
                className="pull-pack-foil"
                data-selected={index === active}
                onClick={() => select(index)}
              >
                <PullPackFace tier={tier} index={index} />
              </div>
            </div>
          ))}
        </div>
        <button
          className="pull-ring-arrow pull-ring-prev"
          type="button"
          aria-label="Previous pack artwork"
          disabled={disabled}
          onClick={() => turn(-1)}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <button
          className="pull-ring-arrow pull-ring-next"
          type="button"
          aria-label="Next pack artwork"
          disabled={disabled}
          onClick={() => turn(1)}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="pull-ring-caption">
        <span aria-live="polite">
          Artwork {active + 1} of {packCount}
        </span>
        <span>Cosmetic choice · Same odds</span>
      </p>
    </div>
  );
}
