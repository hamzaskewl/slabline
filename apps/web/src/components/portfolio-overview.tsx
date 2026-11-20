"use client";
import type { ReactNode } from "react";
import type { DemoAccountView } from "@collectible/domain";
import { UsdcAmount } from "./usdc-amount";
import { PortfolioChart } from "./portfolio-chart";

export function PortfolioOverview({
  compact = false,
  balance,
  total,
  predictionValue,
  collectibleValue,
  packValue = "0",
  history,
  actions,
}: {
  compact?: boolean;
  balance?: string;
  total?: string;
  predictionValue: string;
  collectibleValue: string;
  packValue?: string;
  history?: DemoAccountView["history"];
  actions: ReactNode;
}) {
  return (
    <div className={compact ? "wallet-overview" : "portfolio-topline"}>
      <section className="portfolio-overview panel">
        <div className="portfolio-summary">
          <div>
            <h2>{compact ? "Available balance" : "Portfolio value"}</h2>
            <strong className="portfolio-total">
              {balance === undefined ? (
                "—"
              ) : (
                <UsdcAmount value={compact ? balance : total!} />
              )}
            </strong>
          </div>
          <div className="portfolio-summary-actions">{actions}</div>
        </div>
        {!compact && (
          <dl className="portfolio-breakdown">
            {[
              ["Balance", balance],
              ["Predictions", predictionValue],
              ["Collectibles", collectibleValue],
              ["Packs", packValue],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {balance === undefined ? "—" : <UsdcAmount value={value!} />}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      {!compact && (
        <section
          className="portfolio-performance panel"
          aria-label="Portfolio balance chart"
        >
          <PortfolioChart history={history} currentValue={total} />
        </section>
      )}
    </div>
  );
}
