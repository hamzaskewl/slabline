"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import type { PullActions } from "./pull-account";
import { Dialog } from "radix-ui";
import { ArrowRight, CircleAlert, X } from "lucide-react";
import {
  units,
  canonicalPullTheme,
  type PullOpening,
  type PullTheme,
  type PullTier,
} from "@collectible/domain";
import { usdc } from "@/lib/utils";
import { MarketArtwork } from "./market-artwork";
import { SlablineMark } from "./slabline-mark";
import { Button } from "./ui/button";
import { usePullCatalog } from "./pull-catalog";
import { PullMarketCard } from "./pull-market-cards";
import { PullPackFace } from "./pull-pack-carousel";

const PullRandomness = dynamic(
  () => import("./pull-randomness").then((module) => module.PullRandomness),
  { ssr: false, loading: () => <p role="status">Preparing your draw…</p> },
);

export type PackPresentation = {
  tier: PullTier;
  theme: PullTheme;
  id?: string;
  artwork?: string | null;
  edition?: number;
};

const fragments = Array.from({ length: 24 }, (_, index) => {
  const angle = (index * 137.508 * Math.PI) / 180;
  const radius = 70 + ((index * 37) % 115);
  return {
    "--piece-x": `${Math.round(Math.cos(angle) * radius)}px`,
    "--piece-y": `${Math.round(Math.sin(angle) * radius - 48)}px`,
    "--piece-spin": `${index * 123}deg`,
    "--piece-delay": `${(index % 8) * 18}ms`,
  } as CSSProperties;
});

export function PullCinematic({
  pack,
  opening,
  waiting,
  error,
  actions,
  onClose,
}: {
  pack: PackPresentation;
  opening?: PullOpening;
  waiting: boolean;
  error?: string;
  actions: PullActions;
  onClose: (choose?: boolean) => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const walletPhase = opening?.state === "pending";
  const budget = opening?.state === "ready" ? opening.budget : null;
  const [stage, setStage] = useState<"pack" | "theme" | "budget" | "done">(
    "pack",
  );
  const [skipped, setSkipped] = useState(false);
  const amount = budget ? usdc(budget) : null;
  const showAmount =
    !!amount && (skipped || stage === "budget" || stage === "done");
  const revealed = !!amount && (skipped || stage === "done");
  const win =
    showAmount && budget !== null && units(budget) > units(String(pack.tier));
  const canonical = canonicalPullTheme(pack.theme);
  const theme = canonical.kind === "all" ? "Your predictions" : canonical.label;
  const catalog = usePullCatalog(pack.theme);
  const topMarkets = catalog.markets.slice(0, 3);
  const [marketStep, setMarketStep] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSkipped(true);
      return;
    }
    if (!budget || skipped) return;
    const themeTimer = window.setTimeout(() => setStage("theme"), 850);
    const marketTimers = [850, 2150, 3450]
      .slice(0, Math.max(1, topMarkets.length))
      .map((delay, index) =>
        window.setTimeout(() => setMarketStep(index), delay),
      );
    const budgetAt = 1000 + Math.max(1, topMarkets.length) * 1300;
    const budgetTimer = window.setTimeout(() => setStage("budget"), budgetAt);
    const settledTimer = window.setTimeout(
      () => setStage("done"),
      budgetAt + 850,
    );
    return () => {
      marketTimers.forEach(window.clearTimeout);
      window.clearTimeout(themeTimer);
      window.clearTimeout(budgetTimer);
      window.clearTimeout(settledTimer);
    };
  }, [budget, skipped, topMarkets.length]);

  return (
    <Dialog.Root
      open
      modal={!walletPhase}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        {walletPhase ? (
          <div
            className="pull-cinematic-overlay pull-cinematic-wallet-overlay"
            aria-hidden="true"
          />
        ) : (
          <Dialog.Overlay className="pull-cinematic-overlay" />
        )}
        <Dialog.Content
          className="pull-cinematic"
          data-stage={showAmount ? "budget" : stage}
          data-skipped={skipped || undefined}
          data-ready={!!budget}
          onInteractOutside={(event) => {
            // Privy's approval prompt can be a sibling portal on document.body.
            if (walletPhase) event.preventDefault();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            title.current?.focus();
          }}
        >
          <header className="pull-cinematic-header">
            <Dialog.Title ref={title} tabIndex={-1}>
              ${pack.tier} pack
            </Dialog.Title>
            <Dialog.Close
              className="pull-cinematic-close"
              aria-label="Close pack opening"
            >
              <X size={21} aria-hidden="true" />
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">
            Your pack opening and prediction budget
          </Dialog.Description>
          <div className="pull-cinematic-stage">
            <div
              className="pull-cinematic-foil"
              aria-hidden="true"
              style={
                {
                  "--foil": `${((pack.edition ?? 2) - 2) * 5}deg`,
                } as CSSProperties
              }
            >
              <PullPackFace tier={pack.tier} index={pack.edition} />
            </div>
            <div
              className="pull-cinematic-result"
              aria-live="polite"
              aria-atomic="true"
            >
              {stage !== "pack" || showAmount ? (
                <>
                  {!showAmount && topMarkets.length > 0 ? (
                    <div className="pull-reveal-market" key={marketStep}>
                      <PullMarketCard
                        theme={pack.theme}
                        market={
                          topMarkets[
                            Math.min(marketStep, topMarkets.length - 1)
                          ]!
                        }
                        preview
                      />
                    </div>
                  ) : pack.artwork ? (
                    <MarketArtwork
                      src={pack.artwork}
                      label={theme}
                      className="pull-theme-art"
                    />
                  ) : (
                    <SlablineMark height={48} />
                  )}
                  <p className="pull-cinematic-theme">{theme}</p>
                  {showAmount && amount && (
                    <div className="pull-cinematic-amount">
                      <span aria-hidden="true">Prediction budget</span>
                      <strong aria-hidden="true" className="pull-budget-reel">
                        {Array.from(amount, (digit, index) => (
                          <span key={index} className="pull-reel-window">
                            <span
                              style={
                                {
                                  "--digit-delay": `${index * 42}ms`,
                                } as CSSProperties
                              }
                            >
                              {digit}
                            </span>
                          </span>
                        ))}
                      </strong>
                      {revealed && (
                        <span className="sr-only">
                          Prediction budget {amount}
                        </span>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>
            {win && !skipped && (
              <div className="pull-confetti" aria-hidden="true">
                {fragments.map((style, index) => (
                  <i key={index} style={style} />
                ))}
              </div>
            )}
          </div>
          <footer className="pull-cinematic-footer">
            {revealed ? (
              <Button onClick={() => onClose(true)}>
                Choose a market <ArrowRight size={16} aria-hidden="true" />
              </Button>
            ) : budget ? (
              <Button variant="ghost" onClick={() => setSkipped(true)}>
                Skip animation
              </Button>
            ) : opening?.state === "cancelled" ? (
              <p role="status">
                Opening cancelled. Choose a new pack when you’re ready.
              </p>
            ) : opening?.state === "pending" ? (
              <PullRandomness
                key={opening.id}
                autoStart
                opening={opening}
                actions={actions}
              />
            ) : error ? (
              <div role="alert" className="pull-cinematic-error">
                <CircleAlert size={17} aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : (
              <p role="status">
                {waiting ? "Opening pack…" : "Waiting for your draw…"}
              </p>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
