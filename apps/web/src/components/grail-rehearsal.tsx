"use client";
import { DEMO_GRAIL, demoGrailQuantity } from "@collectible/domain";
import { ArrowUpRight } from "lucide-react";
import { CardImage } from "./card-image";
import { usd } from "@/lib/utils";
export function GrailRehearsal({
  payout,
  side,
}: {
  payout: string;
  side: "yes" | "no";
}) {
  return (
    <aside className="reward-target panel" aria-label="Grail fallback">
      <div className="reward-result-heading">
        <h2>If {side.toUpperCase()} wins</h2>
        <strong>{usd(payout)}</strong>
      </div>
      <h3>No card listed? Get Grail.</h3>
      <div className="reward-card-summary">
        <div className="reward-target-image">
          <CardImage src={DEMO_GRAIL.image} alt="Jensen Huang Grail" eager />
        </div>
        <div className="reward-card-copy">
          <h3>{DEMO_GRAIL.name}</h3>
          <strong>
            {Number(demoGrailQuantity(payout)).toLocaleString("en-US", {
              maximumFractionDigits: 2,
            })}{" "}
            {DEMO_GRAIL.symbol}
          </strong>
          <p>Automatically added to your account when this position wins.</p>
        </div>
      </div>
      <p>
        Devnet rehearsal: no matching Jensen slab in the November 19 catalog
        check. Uses a recorded Grail price; no mainnet swap.
      </p>
      <a
        className="button button-outline button-pill"
        href={DEMO_GRAIL.url}
        target="_blank"
        rel="noreferrer"
      >
        View on Grail <ArrowUpRight size={16} />
      </a>
    </aside>
  );
}
