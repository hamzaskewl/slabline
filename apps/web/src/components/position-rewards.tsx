"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { useModalStatus } from "@privy-io/react-auth";
import {
  cardPlayer,
  units,
  type DemoPosition,
  type Listing,
  type GrailToken,
} from "@collectible/domain";
import { usePrivateRead } from "@/lib/use-private-read";
import { UsdcAmount, UsdcIcon } from "./usdc-amount";
import { usd } from "@/lib/utils";
import { useDemoAction, DemoMintActions } from "./demo-controls";
import {
  RewardSelectionProvider,
  RewardCheckout,
  AddReward,
  useRewardSelection,
} from "./reward-checkout";
import { CardImage } from "./card-image";
import { CardValue } from "./card-value";
import { Select } from "./ui/select";
import { Button } from "./ui/button";
import { GrailReward } from "./grail-reward";

type Inventory = { cards: Listing[]; tokens: GrailToken[]; subject: string };

export function PositionRewards({
  position,
  preview = false,
}: {
  position: DemoPosition;
  preview?: boolean;
}) {
  const [open, setOpen] = useState(false),
    a = useDemoAction();
  const { isOpen: walletModalOpen } = useModalStatus();
  useEffect(() => setOpen(false), [a.user?.id, a.network]);
  const label = preview
    ? "Potential rewards"
    : position.reward?.state === "claimed"
      ? "View cards"
      : position.reward?.state === "allocated"
        ? "Finish claim"
        : "Claim";
  if (position.reward?.delivery === "cash")
    return <span role="status">Balance received</span>;
  if (position.reward?.delivery === "grail")
    return <span role="status">Grail received</span>;
  return (
    <PositionRewardsFrame
      open={open}
      onOpenChange={setOpen}
      label={label}
      subject={position.label}
      preview={preview}
      walletModalOpen={walletModalOpen}
    >
      {open && (
        <RewardSelectionProvider
          positionId={position.id}
          initialPosition={position}
        >
          <PositionRewardsContent position={position} preview={preview} />
        </RewardSelectionProvider>
      )}
    </PositionRewardsFrame>
  );
}

export function PositionRewardsFrame({
  open,
  onOpenChange,
  label,
  subject,
  preview = false,
  walletModalOpen = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  subject: string;
  preview?: boolean;
  walletModalOpen?: boolean;
  children: ReactNode;
}) {
  const lastFocused = useRef<HTMLElement | null>(null);
  const wasWalletOpen = useRef(false);
  useEffect(() => {
    if (
      open &&
      wasWalletOpen.current &&
      !walletModalOpen &&
      lastFocused.current?.isConnected
    )
      lastFocused.current.focus();
    wasWalletOpen.current = walletModalOpen;
  }, [open, walletModalOpen]);
  // Privy portals its confirmation outside this dialog. Keep the basket mounted
  // while allowing that dialog to own focus; only the underlying app is inert.
  useEffect(() => {
    if (!open) return;
    const surfaces = [...document.querySelectorAll<HTMLElement>(".app-shell")];
    const previous = surfaces.map((surface) => surface.inert);
    const overflow = document.body.style.overflow;
    surfaces.forEach((surface) => {
      surface.inert = true;
    });
    document.body.style.overflow = "hidden";
    return () => {
      surfaces.forEach((surface, index) => {
        surface.inert = previous[index]!;
      });
      document.body.style.overflow = overflow;
    };
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Trigger
        className={`button button-outline button-pill ${!preview && (label === "Claim" || label === "Finish claim") ? "claim-button" : ""}`}
      >
        {label}
      </Dialog.Trigger>
      <Dialog.Portal>
        <div
          className="reward-browser-overlay"
          aria-hidden="true"
          onPointerDown={() => {
            if (!walletModalOpen) onOpenChange(false);
          }}
        />
        <Dialog.Content
          className="position-rewards-dialog"
          aria-modal={!walletModalOpen}
          inert={walletModalOpen}
          aria-hidden={walletModalOpen || undefined}
          onFocusCapture={(event) => {
            lastFocused.current = event.target as HTMLElement;
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (walletModalOpen) event.preventDefault();
          }}
        >
          <header className="position-rewards-header">
            <div>
              <Dialog.Title>
                {preview ? "Potential rewards" : label}
              </Dialog.Title>
              <Dialog.Description>
                {subject} · matching listed cards
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close rewards">
              <X size={20} />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PositionRewardsContent({
  position: initial,
  preview,
}: {
  position: DemoPosition;
  preview: boolean;
}) {
  const c = useRewardSelection(),
    a = useDemoAction();
  const position = c?.position ?? initial;
  const inventory = usePrivateRead<Inventory>(
    `/api/demo/rewards?id=${position.id}`,
    position.reward?.state !== "claimed" &&
      position.reward?.state !== "allocated",
  );
  const selected =
    c?.data?.collectibles.filter(
      (card) =>
        card.rewardPositionId === position.id && card.state !== "cancelled",
    ) ?? [];
  const allocated =
    position.reward?.state === "allocated" ||
    position.reward?.state === "claimed";
  return (
    <>
      <div className="position-rewards-scroll">
        {position.reward?.delivery === "cash" ? (
          <div className="claim-delivery">
            <h3>Balance received</h3>
            <p>{usd(position.reward.budget)} is available in your balance.</p>
          </div>
        ) : allocated ? (
          <div className="claim-delivery">
            <h3>
              {position.reward?.state === "claimed"
                ? "Your cards are received"
                : "Your cards are selected"}
            </h3>
            <p>
              {position.reward?.state === "claimed"
                ? "This reward is complete."
                : "Finish each card transfer here. Any leftover is already in your balance."}
            </p>
            {selected.map((card) => (
              <article className="claim-delivery-card" key={card.id}>
                <CardImage src={card.image} alt={card.name} />
                <div>
                  <h4>{card.name}</h4>
                  <CardValue valuation={card.valuation} />
                  <DemoMintActions item={card} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <>
            {!preview && !position.reward && (
              <div className="claim-legacy">
                <h3>Payout received</h3>
                <p>This payout was already added to your balance.</p>
              </div>
            )}
            {!preview &&
              position.reward?.state === "available" &&
              selected.length === 0 && (
                <div className="claim-cash-option">
                  <div>
                    <h3>
                      <UsdcIcon /> Add to balance
                    </h3>
                    <p>
                      {<UsdcAmount value={position.reward.budget} />} goes to
                      your available balance.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={a.busy}
                    onClick={() =>
                      void a.run(async () => {
                        await a.request({
                          action: "cash-reward",
                          id: position.id,
                        });
                      })
                    }
                  >
                    {a.busy ? (
                      "Claiming…"
                    ) : (
                      <>
                        Claim <UsdcIcon />
                      </>
                    )}
                  </Button>
                  {a.error && <p role="alert">{a.error}</p>}
                </div>
              )}
            <p className="claim-budget-note">
              {preview ? "Potential reward: " : "Reward budget: "}
              <UsdcAmount
                value={
                  preview
                    ? position.quantity
                    : (position.reward?.budget ?? position.payout ?? "0")
                }
              />
              . Choose any cards. Cover the difference with your balance, or
              keep the full reward in your balance.
            </p>
            {inventory.isPending && (
              <p role="status">Loading matching cards…</p>
            )}
            {inventory.error && (
              <div role="alert">
                <p>{inventory.error.message}</p>
                <Button
                  variant="outline"
                  onClick={() => void inventory.refetch()}
                >
                  Retry cards
                </Button>
              </div>
            )}
            {inventory.data && (
              <PositionRewardCatalog
                cards={inventory.data.cards}
                subject={inventory.data.subject}
                budget={
                  position.reward?.budget ??
                  position.payout ??
                  position.quantity
                }
                claimable={!preview && position.reward?.state === "available"}
                refreshing={inventory.isFetching}
                onRefresh={() => {
                  c?.clear();
                  void inventory.refetch();
                }}
              />
            )}
            {!!inventory.data?.tokens.length && (
              <section className="claim-grail">
                <h3>Matching Grail rewards</h3>
                {inventory.data.tokens.map((token) => (
                  <GrailReward
                    key={token.id}
                    token={token}
                    payout={position.reward?.budget ?? position.quantity}
                    claimable={
                      !preview && position.reward?.state === "available"
                    }
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
      {!preview && position.reward?.state === "available" && (
        <footer className="position-rewards-checkout">
          <RewardCheckout />
        </footer>
      )}
      {allocated && (
        <footer className="position-rewards-footer">
          <Dialog.Close className="button button-primary button-pill">
            Done
          </Dialog.Close>
        </footer>
      )}
    </>
  );
}

export function PositionRewardCatalog({
  cards,
  subject,
  budget,
  claimable = false,
  onRefresh,
  refreshing = false,
}: {
  cards: Listing[];
  subject: string;
  budget: string;
  claimable?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [player, setPlayer] = useState("all");
  const players = [
    ...new Set(cards.map(cardPlayer).filter((p): p is string => !!p)),
  ].sort();
  const visible = cards
    .filter(
      (card) =>
        (player === "all" || cardPlayer(card) === player) &&
        `${card.name} ${cardPlayer(card) ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => Number(a.ask) - Number(b.ask));
  return (
    <section className="claim-catalog">
      <div className="claim-filters">
        <input
          type="search"
          aria-label="Search matching cards"
          placeholder="Search matching cards"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {players.length > 1 && (
          <Select
            aria-label="Filter by player"
            value={player}
            onChange={(e) => setPlayer(e.target.value)}
          >
            <option value="all">All players</option>
            {players.map((p) => (
              <option value={p} key={p}>
                {p}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div className="claim-card-count">
        <p>
          {visible.length} {visible.length === 1 ? "card" : "cards"} · {subject}
        </p>
        {onRefresh && (
          <button
            className="text-button"
            disabled={refreshing}
            onClick={onRefresh}
          >
            {refreshing ? "Refreshing…" : "Refresh cards"}
          </button>
        )}
      </div>
      {visible.length ? (
        <div className="claim-card-grid">
          {visible.map((card) => (
            <article className="claim-card" key={card.mint}>
              <CardImage src={card.frontImage} alt={card.name} />
              <div className="claim-card-copy">
                <h3>{card.name}</h3>
                <div className="card-price-row">
                  <strong className="listing-price">
                    <UsdcAmount value={card.ask} />
                  </strong>
                  <CardValue valuation={card.valuation} ask={card.ask} />
                </div>
                {claimable ? (
                  <AddReward
                    item={{
                      source: "collectorcrypt",
                      sourceId: card.mint,
                      name: card.name,
                      image: card.frontImage,
                      cost: card.ask,
                      valuation: card.valuation,
                    }}
                  />
                ) : (
                  <span className="claim-card-budget">
                    {units(card.ask) > units(budget)
                      ? `${usd(Number(card.ask) - Number(budget))} extra from balance`
                      : "Within reward budget"}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="holdings-empty">
          <p>
            {cards.length
              ? "No cards match these filters."
              : "No matching cards are currently listed. Your reward stays available."}
          </p>
          {cards.length > 0 && (
            <Button
              variant="outline"
              className="button-pill"
              onClick={() => {
                setSearch("");
                setPlayer("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export function RewardClaimEntry() {
  const c = useRewardSelection();
  const position = c?.data?.positions.find(
    (p) => p.state === "won" && p.reward?.state !== "claimed",
  );
  if (!position) return null;
  return (
    <div className="reward-budget-banner">
      <div>
        <h2>
          You won {usd(position.reward?.budget ?? position.payout ?? "0")}
        </h2>
        <p>{position.label}</p>
      </div>
      <PositionRewards position={position} />
    </div>
  );
}
