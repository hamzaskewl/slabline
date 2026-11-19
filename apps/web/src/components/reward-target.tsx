"use client";
import { useEffect, useMemo, useState } from "react";
import { Layers3 } from "lucide-react";
import {
  payoutTarget,
  rewardForPayout,
  teamCardMatch,
  selectedRewardTeam,
  cardTeam,
  cents,
  type Book,
  type Listing,
  type Market,
  type GrailToken,
} from "@collectible/domain";
import { usd } from "@/lib/utils";
import { GrailReward } from "./grail-reward";
import { RewardBrowser } from "./reward-browser";

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
  stake,
  stakeRevision,
  onStake,
  loading,
  error,
}: {
  cards: Listing[];
  tokens: GrailToken[];
  market: Market | null;
  book: Book | null;
  side: "yes" | "no";
  stale: boolean;
  payout: string | null;
  stake: string;
  stakeRevision: number;
  onStake: (value: string) => void;
  loading?: boolean;
  error?: string | null;
}) {
  const [choice, setChoice] = useState<{
    mint: string;
    revision: number;
  } | null>(null);
  const selectedMint = choice?.revision === stakeRevision ? choice.mint : null;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const { card, covered } = useMemo(
    () => rewardForPayout(cards, payout, selectedMint),
    [cards, payout, selectedMint],
  );
  // Keep the suggested image steady while live quotes update. Only editing the
  // stake or explicitly browsing cards chooses a new target.
  useEffect(() => {
    if (
      payout !== null &&
      card &&
      (choice?.revision !== stakeRevision || choice.mint !== card.mint)
    )
      setChoice({ mint: card.mint, revision: stakeRevision });
  }, [card, payout, choice, stakeRevision]);
  const target = useMemo(() => {
    if (!card || !book || stale) return null;
    try {
      return payoutTarget(card.ask, book, side);
    } catch {
      return null;
    }
  }, [card, book, side, stale]);
  const stakeMatchesTarget =
    !!target?.stake && Number(stake) === Number(target.stake);
  const team = market && card ? teamCardMatch(market, card) : null;
  const selectedTeam = market ? selectedRewardTeam(market) : null;
  if (!card)
    return tokens[0] ? (
      <GrailReward
        key={tokens[0].id}
        token={tokens[0]}
        payout={payout}
        side={side}
      />
    ) : (
      <aside className="reward-target panel" aria-label="Potential reward">
        <h2>{selectedTeam ? `${selectedTeam.name} cards` : "Related cards"}</h2>
        <p className="reward-empty-copy">
          {loading
            ? "Loading listed cards…"
            : (error ?? "No verified matching cards are listed right now.")}
        </p>
        {!loading && !error && (
          <a className="reward-browse-button" href="/rewards">
            Browse all cards
          </a>
        )}
      </aside>
    );
  return (
    <aside className="reward-target panel" aria-label="Potential reward">
      <div className="reward-result-heading">
        <h2>If {side.toUpperCase()} wins</h2>
        <strong>
          {payout ? usd(payout) : "—"} <small>USD</small>
        </strong>
      </div>
      <p className="reward-target-note">Before fees. Cards are not reserved.</p>
      <p className="reward-team-heading">
        {selectedTeam ? `${selectedTeam.name} · ` : ""}
        {cards.length} listed {cards.length === 1 ? "card" : "cards"}
      </p>
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
          <p className="reward-card-team">
            Team on card: {cardTeam(card) ?? "Not verified"}
          </p>
          <div className="reward-ask">
            {Number(card.ask).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            <span>USDC</span>
          </div>
          <span className={`reward-fit ${covered ? "covered" : ""}`}>
            {covered
              ? "Within estimated payout"
              : payout
                ? "Above estimated payout"
                : "Card target"}
          </span>
        </div>
      </div>
      <RewardBrowser
        cards={cards}
        selected={card}
        team={selectedTeam?.name}
        payout={payout}
        onSelect={(mint) => setChoice({ mint, revision: stakeRevision })}
      />
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
      <button
        className="reward-set-stake"
        disabled={!target?.stake || stakeMatchesTarget}
        onClick={() => target?.stake && onStake(target.stake)}
      >
        {target?.stake
          ? stakeMatchesTarget
            ? "Stake set for this card"
            : "Set stake for this card"
          : stale || !book
            ? "Waiting for live depth"
            : "Target unavailable at current depth"}
        {target?.stake && !stakeMatchesTarget && (
          <span>
            {usd(target.stake)} USD · {shares(target.sharesNeeded)} shares
          </span>
        )}
      </button>
      <details className="reward-assumptions">
        <summary>Fees & availability</summary>
        <p>
          Payout is before fees, assuming $1 USD = 1 USDC. Cards are not
          reserved.
        </p>
        {team && (
          <a href={team.source} target="_blank" rel="noreferrer">
            {team.name} · {team.player} (
            {team.basis === "card" ? "card image" : "team history"})
          </a>
        )}
      </details>
    </aside>
  );
}
