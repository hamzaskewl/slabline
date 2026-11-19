"use client";
import { useState } from "react";
import { Info } from "lucide-react";
import { Tooltip } from "radix-ui";
import { fmvComparison, type Valuation } from "@collectible/domain";
import { usd } from "@/lib/utils";
export function CardValue({
  valuation,
  ask,
}: {
  valuation?: Valuation | null;
  ask?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { value, tone, difference } = fmvComparison(valuation, ask);
  const comparison =
    difference === null
      ? null
      : Math.abs(difference) < 0.05
        ? "Listed at FMV"
        : `Listed ${Math.abs(difference).toLocaleString("en-US", { maximumFractionDigits: 1 })}% ${difference < 0 ? "below" : "above"} FMV`;
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root open={open} onOpenChange={setOpen}>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="card-fmv"
            data-tone={tone}
            aria-label={`About fair market value: ${value === null ? "unavailable" : usd(value)}${comparison ? `. ${comparison}` : ""}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(true);
            }}
          >
            <span className="card-fmv-label">FMV</span>
            <strong>{value === null ? "Unavailable" : usd(value)}</strong>
            <Info size={13} aria-hidden="true" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="fmv-tooltip"
            side="top"
            sideOffset={8}
            collisionPadding={16}
          >
            <strong>Fair market value</strong>
            <p>
              Estimated resale value from Card Hedge, matched using the card’s
              certificate, grader and grade. Actual sale prices vary.
            </p>
            {value === null ? (
              <p>No current matched estimate is available for this card.</p>
            ) : (
              <>
                {comparison && (
                  <p className="fmv-tooltip-comparison" data-tone={tone}>
                    {comparison}
                  </p>
                )}
                <p>
                  Green: at or below 110% of FMV. Amber: up to 125%. Red: above
                  125%.
                </p>
                <span className="fmv-tooltip-meta">
                  Updated{" "}
                  {new Date(valuation!.observedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  ·{" "}
                  {valuation!.confidence === "low"
                    ? "Low-confidence match"
                    : "Direct certificate match"}
                </span>
              </>
            )}
            <Tooltip.Arrow className="fmv-tooltip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
