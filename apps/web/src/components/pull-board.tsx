"use client";

import { useState, type ReactNode } from "react";
import {
  PULL_OUTCOMES,
  PULL_TIERS,
  type PullTheme,
  type PullTier,
} from "@collectible/domain";
import { Button } from "./ui/button";
import { usd, usdc } from "@/lib/utils";
import { usePullCatalog } from "./pull-catalog";
import { packCount, PullPackCarousel } from "./pull-pack-carousel";
import { ChevronDown } from "lucide-react";
import type { PackPresentation } from "./pull-cinematic";

export function PullBoard({
  balance,
  busy = false,
  mode,
  action,
  opening,
  history,
}: {
  balance?: string;
  busy?: boolean;
  mode?: "demo-csprng" | "magicblock-devnet";
  action: (pack: PackPresentation, eligible: boolean) => ReactNode;
  opening?: ReactNode;
  history?: ReactNode;
}) {
  const [tier, setTier] = useState<PullTier>(25);
  const [rotation, setRotation] = useState(0);
  const [theme, setTheme] = useState<PullTheme>({ kind: "all" });
  const catalog = usePullCatalog(theme);
  const hasTheme = theme.kind === "all" || !!theme.label.trim();
  const hasMatches =
    hasTheme && !catalog.searching && catalog.markets.length > 0;
  const eligible = hasMatches && !catalog.delayed;
  const preview = hasMatches ? catalog.markets[0] : undefined;
  const artwork =
    theme.kind === "all"
      ? undefined
      : theme.kind === "team"
        ? (preview?.teams?.find((team) =>
            team.label.toLowerCase().includes(theme.label.trim().toLowerCase()),
          )?.imageUrl ?? preview?.imageUrl)
        : preview?.imageUrl;
  return (
    <section className="pull-workspace" aria-labelledby="pull-title">
      <header className="pull-heading">
        <div>
          <h1 id="pull-title">Pull &amp; Predict</h1>
          <p>Open a pack. Reveal your prediction budget.</p>
        </div>
        <span className="pull-mode">Devnet demo</span>
      </header>
      <div className="pull-grid">
        <div>
          {opening}
          <section
            className="pull-panel pull-stack"
            aria-labelledby="pack-title"
          >
            <div className="pull-panel-heading">
              <h2 id="pack-title">Choose a pack</h2>
              {balance !== undefined && (
                <span className="pull-muted">{usdc(balance)} demo cash</span>
              )}
            </div>
            <fieldset disabled={busy}>
              <legend>Pack price</legend>
              <div className="pull-tier-options">
                {PULL_TIERS.map((price) => (
                  <label className="pull-choice" key={price}>
                    <input
                      type="radio"
                      name="pull-tier"
                      checked={tier === price}
                      onChange={() => {
                        setTier(price);
                        setRotation(0);
                      }}
                    />
                    ${price}
                  </label>
                ))}
              </div>
            </fieldset>
            <PullPackCarousel
              key={tier}
              tier={tier}
              disabled={busy}
              rotation={rotation}
              onTurn={(step) => setRotation((current) => current + step)}
            />
            <PullThemePicker
              theme={theme}
              onChange={setTheme}
              disabled={busy}
            />
            <div className="pull-catalog-preview" aria-live="polite">
              <p className="pull-muted">
                {theme.kind !== "all" && !theme.label.trim()
                  ? `Enter a ${theme.kind} name to explore available markets.`
                  : catalog.searching
                    ? "Checking available markets…"
                    : catalog.unavailable
                      ? "Market catalog unavailable."
                      : hasMatches
                        ? `${catalog.markets.length} matching ${catalog.markets.length === 1 ? "market" : "markets"}`
                        : catalog.delayed
                          ? "No matches in the saved catalog. Try another search or choose All markets."
                          : "No matching markets. Try another search or choose All markets."}
              </p>
              {hasMatches && theme.kind !== "all" && (
                <ul>
                  {catalog.markets.slice(0, 3).map((market) => (
                    <li key={market.id}>{market.title}</li>
                  ))}
                </ul>
              )}
              {catalog.delayed && !catalog.searching && (
                <p className="pull-muted">
                  Market updates delayed. New packs open when the catalog
                  refreshes.
                </p>
              )}
              {(catalog.delayed || catalog.unavailable) &&
                !catalog.searching && (
                  <PullRetry onClick={() => void catalog.refetch()}>
                    Refresh markets
                  </PullRetry>
                )}
            </div>
            <details className="pull-odds-inline pull-compact-odds">
              <summary>
                Pack odds <ChevronDown size={15} aria-hidden="true" />
              </summary>
              <PackOdds tier={tier} />
            </details>
            {mode && (
              <p className="pull-muted pull-randomness-label">
                {mode === "magicblock-devnet"
                  ? "MagicBlock VRF · Wallet pays Devnet fee"
                  : "Practice draw · Server randomness"}
              </p>
            )}
            {action(
              {
                tier,
                theme,
                edition: ((rotation % packCount) + packCount) % packCount,
                artwork,
              },
              eligible,
            )}
          </section>
        </div>
        <aside>
          <section
            className="pull-panel pull-odds-sidebar"
            aria-labelledby="odds-title"
          >
            <h2 id="odds-title">Pack odds</h2>
            <PackOdds tier={tier} />
          </section>
          {history}
        </aside>
      </div>
    </section>
  );
}

function PackOdds({ tier }: { tier: PullTier }) {
  return (
    <>
      <p className="pull-muted">Budget revealed from a ${tier} pack</p>
      <ul className="pull-odds">
        {PULL_OUTCOMES.map(({ multiplier, multiplierBps, weightBps }) => (
          <li key={multiplier}>
            <strong>{usd((tier * multiplierBps) / 10000)}</strong>
            <span>{multiplier}×</span>
            <span>{weightBps / 100}%</span>
          </li>
        ))}
      </ul>
      <p className="pull-expected">
        <strong>{usd((tier * 98) / 100)} expected budget</strong>
      </p>
      <p className="pull-muted">
        98% of pack price on average. Your prediction has its own settlement
        risk.
      </p>
    </>
  );
}

function PullThemePicker({
  theme,
  onChange,
  disabled,
}: {
  theme: PullTheme;
  disabled: boolean;
  onChange: (theme: PullTheme) => void;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Market theme</legend>
      <div className="pull-theme-options">
        {(["all", "team", "player"] as const).map((kind) => (
          <label className="pull-choice" key={kind}>
            <input
              type="radio"
              name="pull-theme-kind"
              checked={theme.kind === kind}
              onChange={() =>
                onChange(kind === "all" ? { kind } : { kind, label: "" })
              }
            />
            {kind === "all"
              ? "All markets"
              : kind === "team"
                ? "Team"
                : "Player"}
          </label>
        ))}
      </div>
      {theme.kind !== "all" && (
        <label className="pull-field pull-theme-search">
          <span>Search by {theme.kind}</span>
          <input
            type="search"
            value={theme.label}
            onChange={(event) =>
              onChange({ kind: theme.kind, label: event.target.value })
            }
            maxLength={100}
          />
        </label>
      )}
    </fieldset>
  );
}

export function PullRetry({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="pull-action"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
