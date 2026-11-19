"use client";
import { useState } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { ArrowUpRight, Layers3, X } from "lucide-react";
import { cardTeam, type Listing } from "@collectible/domain";
import { usd } from "@/lib/utils";

export function CardDetails({ card }: { card: Listing }) {
  const [side, setSide] = useState<"front" | "back">("front"),
    [failed, setFailed] = useState(false);
  const image = side === "front" ? card.frontImage : card.backImage;
  return (
    <Dialog.Root>
      <Dialog.Trigger
        className="card-detail-trigger"
        aria-label={`View details for ${card.name}`}
      >
        View card <ArrowUpRight size={16} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="reward-browser-overlay" />
        <Dialog.Content className="card-inspector">
          <header>
            <Dialog.Title>{card.name}</Dialog.Title>
            <Dialog.Close
              className="card-inspector-close"
              aria-label="Close card details"
            >
              <X size={21} />
            </Dialog.Close>
          </header>
          <Dialog.Description>
            Collector Crypt listing · {card.network}
          </Dialog.Description>
          <div className="card-inspector-body">
            <div className="card-inspector-media">
              <div className="card-inspector-image">
                {image && !failed ? (
                  <img
                    src={image}
                    alt={`${card.name}, ${side} of slab`}
                    referrerPolicy="no-referrer"
                    onError={() => setFailed(true)}
                  />
                ) : (
                  <div className="missing-image">
                    <Layers3 size={36} />
                    <span>Provider image unavailable</span>
                  </div>
                )}
              </div>
              {card.backImage && (
                <div className="card-image-tabs" aria-label="Slab image">
                  {(["front", "back"] as const).map((value) => (
                    <button
                      key={value}
                      aria-pressed={side === value}
                      onClick={() => {
                        setSide(value);
                        setFailed(false);
                      }}
                    >
                      {value === "front" ? "Front" : "Back"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="card-inspector-copy">
              <p className="card-inspector-price">
                {usd(card.ask)} <span>USDC</span>
              </p>
              <p>
                Listing ask, not a valuation. Availability and price may change.
              </p>
              <dl>
                {[
                  [
                    "Grading",
                    [card.grader, card.grade].filter(Boolean).join(" "),
                  ],
                  ["Certificate", card.cert],
                  ["Set", card.set],
                  ["Year", card.year],
                  ["Team on card", cardTeam(card)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "Not verified"}</dd>
                  </div>
                ))}
              </dl>
              <p>
                In-app checkout is unavailable. Continue on Collector Crypt to
                find the listing and review purchase options.
              </p>
              <a
                className="button button-primary"
                href="https://collectorcrypt.com"
                target="_blank"
                rel="noreferrer"
              >
                Open Collector Crypt <ArrowUpRight size={17} />
              </a>
              {card.player && (
                <Dialog.Close asChild>
                  <Link
                    className="text-link"
                    href={`/?q=${encodeURIComponent(card.player)}`}
                  >
                    Find markets for {card.player} <ArrowUpRight size={15} />
                  </Link>
                </Dialog.Close>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
