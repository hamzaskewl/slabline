"use client";
import { useMemo, useState } from "react";
import { Dialog } from "radix-ui";
import { ChevronLeft, ChevronRight, Layers3, X } from "lucide-react";
import { cardPlayer, cardTeam, units, type Listing } from "@collectible/domain";
import { MarketSelect } from "./discovery-controls";
import { usd } from "@/lib/utils";

export function RewardBrowser({
  cards,
  selected,
  team,
  payout,
  onSelect,
  onAuto,
  automatic,
}: {
  cards: Listing[];
  selected: Listing;
  team?: string;
  payout: string | null;
  onSelect: (mint: string) => void;
  onAuto: () => void;
  automatic: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [player, setPlayer] = useState("all");
  const [onCardOnly, setOnCardOnly] = useState(false);
  const [withinPayout, setWithinPayout] = useState(false);
  const sorted = useMemo(
    () =>
      [...cards].sort(
        (a, b) => Number(a.ask) - Number(b.ask) || a.mint.localeCompare(b.mint),
      ),
    [cards],
  );
  const players = [
    ...new Set(cards.map(cardPlayer).filter((p): p is string => !!p)),
  ].sort();
  const index = sorted.findIndex((c) => c.mint === selected.mint);
  const visible = sorted.filter(
    (c) =>
      (player === "all" || cardPlayer(c) === player) &&
      (!onCardOnly || cardTeam(c) === team) &&
      (!withinPayout || (payout !== null && units(c.ask) <= units(payout))),
  );
  return (
    <>
      <div className="reward-browse-controls">
        <button
          className="reward-auto"
          aria-pressed={automatic}
          onClick={onAuto}
        >
          {automatic ? "Auto match" : "Use auto match"}
        </button>
        <div className="reward-card-arrows">
          <button
            aria-label="Previous card"
            disabled={index <= 0}
            onClick={() => onSelect(sorted[index - 1]!.mint)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            {index + 1} / {cards.length}
          </span>
          <button
            aria-label="Next card"
            disabled={index >= sorted.length - 1}
            onClick={() => onSelect(sorted[index + 1]!.mint)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger className="reward-browse-button">
          Browse {cards.length} {team ? "team " : ""}cards
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="reward-browser-overlay" />
          <Dialog.Content className="reward-browser">
            <header>
              <div>
                <Dialog.Title>
                  {team ? `${team} cards` : "Choose a card"}
                </Dialog.Title>
                <Dialog.Description>
                  {cards.length} listed cards · {players.length}{" "}
                  {players.length === 1 ? "player" : "players"}. Choosing a card
                  keeps your stake unchanged.
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="reward-browser-close"
                aria-label="Close card browser"
              >
                <X size={20} />
              </Dialog.Close>
            </header>
            <div className="reward-browser-filters">
              <MarketSelect
                label="Filter cards by player"
                value={player}
                onChange={setPlayer}
                options={[
                  { value: "all", label: "All players" },
                  ...players.map((p) => ({ value: p, label: p })),
                ]}
              />
              {team && (
                <button
                  aria-pressed={onCardOnly}
                  onClick={() => setOnCardOnly(!onCardOnly)}
                >
                  Team on card only
                </button>
              )}
              <button
                aria-pressed={withinPayout}
                onClick={() => setWithinPayout(!withinPayout)}
              >
                Within payout
              </button>
            </div>
            <div className="reward-browser-results" aria-live="polite">
              {visible.length ? (
                visible.map((c) => (
                  <button
                    className="reward-browser-card"
                    key={c.mint}
                    onClick={() => {
                      onSelect(c.mint);
                      setOpen(false);
                    }}
                    aria-label={`Choose ${c.name}`}
                    aria-pressed={c.mint === selected.mint}
                  >
                    {c.frontImage ? (
                      <img
                        src={c.frontImage}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Layers3 size={32} />
                    )}
                    <span className="reward-browser-card-copy">
                      <strong>{c.name}</strong>
                      <span>Team on card: {cardTeam(c) ?? "Not verified"}</span>
                      <span className="reward-browser-price">
                        {usd(c.ask)} USDC
                      </span>
                      <span>
                        {payout !== null && units(c.ask) <= units(payout)
                          ? "Within estimated payout"
                          : payout === null
                            ? "No payout estimate"
                            : "Above estimated payout"}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="reward-browser-empty">
                  <p>No listed cards match these filters.</p>
                  <button
                    onClick={() => {
                      setPlayer("all");
                      setOnCardOnly(false);
                      setWithinPayout(false);
                    }}
                  >
                    Reset card filters
                  </button>
                </div>
              )}
            </div>
            <footer>
              Team matches include verified player associations and past
              players. “Team on card” is shown only when verified from the
              listing or card image.
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
