"use client";
import { useMemo, useState } from "react";
import { Layers3 } from "lucide-react";
import {
  payoutTarget,
  teamRewardMatch,
  cents,
  type Book,
  type Listing,
  type Market,
} from "@collectible/domain";
import { usd } from "@/lib/utils";

const shares = (value: string) =>
  Number(value).toLocaleString("en-US", { maximumFractionDigits: 6 });
export function RewardTarget({
  cards,
  market,
  book,
  side,
  stale,
  loading,
  error,
  payout,
  onStake,
}: {
  cards: Listing[];
  market: Market | null;
  book: Book | null;
  side: "yes" | "no";
  stale: boolean;
  loading: boolean;
  error: string | null;
  payout: string | null;
  onStake: (value: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const sorted = useMemo(
    () => [...cards].sort((a, b) => Number(a.ask) - Number(b.ask)),
    [cards],
  );
  const card = sorted.find((c) => c.mint === chosen) ?? sorted[0];
  const target = useMemo(() => {
    if (!card || !book || stale) return null;
    try {
      return payoutTarget(card.ask, book, side);
    } catch {
      return null;
    }
  }, [card, book, side, stale]);
  const team = market && card ? teamRewardMatch(market, card) : null;
  return (
    <aside className="reward-target panel" aria-label="Collectible target">
      <h2>Collectible</h2>
      {card ? (
        <>
          {sorted.length > 1 && (
            <select
              aria-label="Choose collectible"
              value={card.mint}
              onChange={(e) => setChosen(e.target.value)}
            >
              {sorted.map((c) => (
                <option key={c.mint} value={c.mint}>
                  {c.name} · {c.ask} USDC
                </option>
              ))}
            </select>
          )}
          <div className="reward-target-image">
            {card.frontImage && failedImage !== card.mint ? (
              <img
                src={card.frontImage}
                alt={card.name}
                referrerPolicy="no-referrer"
                onError={() => setFailedImage(card.mint)}
              />
            ) : (
              <>
                <Layers3 size={36} />
                <span>Image unavailable</span>
              </>
            )}
          </div>
          <h3>{card.name}</h3>
          {team && (
            <a
              className="reward-team-link"
              href={team.source}
              target="_blank"
              rel="noreferrer"
            >
              {team.name} · {team.player}
            </a>
          )}
          <div className="reward-ask">
            {Number(card.ask).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            <span>USDC</span>
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
                {cents(
                  target?.averagePrice ?? null,
                  book?.priceIncrement,
                  true,
                )}
              </dd>
            </div>
          </dl>
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
          <div className="reward-current-payout">
            <span>Your winning payout</span>
            <strong>{payout ? usd(payout) : "—"} USD</strong>
          </div>
          <p className="reward-target-note">
            Before fees. Assumes $1 USD = 1 USDC. A losing prediction pays $0.
          </p>
          <details className="reward-assumptions">
            <summary>Estimate details</summary>
            <p>
              Each winning share settles at $1 USD. Gemini trading, conversion,
              withdrawal and card purchase fees are not verified or included.
              Listing availability and price can change; this card is not
              reserved. Live trading and redemption remain disabled.
            </p>
          </details>
        </>
      ) : (
        <div className="reward-target-empty">
          <Layers3 size={32} />
          <p>
            {loading
              ? "Loading related cards…"
              : (error ?? "No listed card matches this outcome.")}
          </p>
        </div>
      )}
    </aside>
  );
}
