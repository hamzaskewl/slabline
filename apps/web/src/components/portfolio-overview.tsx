"use client";
import type { ReactNode } from "react";
import type { DemoAccountView } from "@collectible/domain";
import { usd } from "@/lib/utils";
import { PortfolioChart } from "./portfolio-chart";

export function PortfolioOverview({
  compact = false,
  balance,
  total,
  predictionValue,
  collectibleValue,
  rewardValue,
  history,
  actions,
}: {
  compact?: boolean;
  balance?: string;
  total?: string;
  predictionValue: string;
  collectibleValue: string;
  rewardValue: string;
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
              {balance === undefined ? "—" : usd(compact ? balance : total!)}
            </strong>
            <p>
              {compact
                ? "Demo USD · available to trade"
                : "Demo account · at cost"}
            </p>
          </div>
          <div className="portfolio-summary-actions">{actions}</div>
        </div>
        {!compact && (
          <dl className="portfolio-breakdown">
            {[
              ["Cash", balance],
              ["Predictions", predictionValue],
              ["Collectibles", collectibleValue],
              ["Rewards", rewardValue],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{balance === undefined ? "—" : usd(value!)}</dd>
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
