"use client";
import { useMemo, useState } from "react";
import { Layers3 } from "lucide-react";
import {
  payoutTarget,
  rewardForPayout,
  teamRewardMatch,
  cents,
  type Book,
  type Listing,
  type Market,
  type GrailToken,
} from "@collectible/domain";
import { usd } from "@/lib/utils";
import { GrailReward } from "./grail-reward";

const shares = (value: string) =>
  Number(value).toLocaleString("en-US", { maximumFractionDigits: 6 });
export function RewardTarget({
  cards,
  tokens,
  market,
  book,
  side,
  stale,
  payout,
  onStake,
}: {
  cards: Listing[];
  tokens: GrailToken[];
  market: Market | null;
  book: Book | null;
  side: "yes" | "no";
  stale: boolean;
  payout: string | null;
  onStake: (value: string) => void;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const { card, next, covered } = useMemo(
    () => rewardForPayout(cards, payout),
    [cards, payout],
  );
  const target = useMemo(() => {
    if (!card || !book || stale) return null;
    try {
      return payoutTarget(card.ask, book, side);
    } catch {
      return null;
    }
  }, [card, book, side, stale]);
  const nextTarget = useMemo(() => {
    if (!next || !book || stale) return null;
    try {
      return payoutTarget(next.ask, book, side);
    } catch {
      return null;
    }
  }, [next, book, side, stale]);
  const team = market && card ? teamRewardMatch(market, card) : null;
  if (!card)
    return tokens[0] ? (
      <GrailReward
        key={tokens[0].id}
        token={tokens[0]}
        payout={payout}
        side={side}
      />
    ) : null;
  return (
    <aside className="reward-target panel" aria-label="Potential reward">
      <div className="reward-result-heading">
        <h2>If {side.toUpperCase()} wins</h2>
        <strong>
          {payout ? usd(payout) : "—"} <small>USD*</small>
        </strong>
      </div>
      <div
        className="reward-card-summary"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="reward-target-image">
          {card.frontImage && failedImage !== card.mint ? (
            <img
              src={card.frontImage}
              alt={card.name}
              referrerPolicy="no-referrer"
              onError={() => setFailedImage(card.mint)}
            />
          ) : (
            <Layers3 size={36} aria-label="Image unavailable" />
          )}
        </div>
        <div className="reward-card-copy">
          <h3>{card.name}</h3>
          <div className="reward-ask">
            {Number(card.ask).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            <span>USDC</span>
          </div>
          <span className={`reward-fit ${covered ? "covered" : ""}`}>
            {covered
              ? "Within gross payout*"
              : payout
                ? "Closest card"
                : "Card target"}
          </span>
        </div>
      </div>
      <dl className="reward-target-stats">
        <div>
          <dt>Winning shares needed</dt>
          <dd>{target ? shares(target.sharesNeeded) : shares(card.ask)}</dd>
        </div>
        <div>
          <dt>Estimated stake</dt>
          <dd>
            {target?.stake ? usd(target.stake) : "—"} <small>USD</small>
          </dd>
        </div>
        <div>
          <dt>Average at target</dt>
          <dd>
            {cents(target?.averagePrice ?? null, book?.priceIncrement, true)}
          </dd>
        </div>
      </dl>
      {!covered && (
        <button
          className="reward-set-stake"
          disabled={!target?.stake}
          onClick={() => target?.stake && onStake(target.stake)}
        >
          {target?.stake
            ? `Set stake to ${usd(target.stake)}`
            : stale || !book
              ? "Waiting for live depth"
              : "Target unavailable at current depth"}
        </button>
      )}
      {covered && next && (
        <button
          className="reward-next"
          disabled={!nextTarget?.stake}
          onClick={() => nextTarget?.stake && onStake(nextTarget.stake)}
        >
          Next card · {usd(next.ask)} USDC{" "}
          <span>
            {nextTarget?.stake
              ? `Set stake to ${usd(nextTarget.stake)}`
              : "Waiting for enough depth"}
          </span>
        </button>
      )}
      <details className="reward-assumptions">
        <summary>* Fees & availability</summary>
        <p>
          Gross payout before fees, assuming $1 USD = 1 USDC. A losing
          prediction pays $0. Conversion, withdrawal and purchase costs reduce
          the amount available. Cards are not reserved. Live trading and
          redemption are disabled.
        </p>
        {team && (
          <a href={team.source} target="_blank" rel="noreferrer">
            {team.name} · {team.player}
          </a>
        )}
      </details>
    </aside>
  );
}
