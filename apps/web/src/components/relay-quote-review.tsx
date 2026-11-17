"use client";
import { RefreshCw } from "lucide-react";
import {
  relayRoutes,
  relayFormat,
  type RelayRecord,
  type RelayFee,
} from "@collectible/domain";
import { Button } from "./ui/button";
const feeLabel = (fee: RelayFee) => `${fee.formatted} ${fee.symbol}`;

export function RelayQuoteReview({
  record,
  now,
  busy,
  onStatus,
}: {
  record: RelayRecord;
  now: number;
  busy: boolean;
  onStatus?: () => void;
}) {
  const quote = record.quote;
  if (!quote) return null;
  const route = relayRoutes[quote.input.routeId],
    expired = now >= Date.parse(quote.expiresAt);
  return (
    <div className="relay-review" aria-live="polite">
      <div className="relay-heading">
        <h3>{expired ? "Quote expired" : "Live Relay quote"}</h3>
        <span>
          {route.environment === "testnet" ? "Testnet" : "Mainnet · read-only"}
        </span>
      </div>
      <dl>
        <div>
          <dt>You send</dt>
          <dd>
            {relayFormat(quote.amountIn, route.decimals)} {route.symbol}
          </dd>
        </div>
        <div>
          <dt>Estimated received</dt>
          <dd>
            {relayFormat(quote.amountOut, route.decimals)} {route.symbol}
          </dd>
        </div>
        <div>
          <dt>Minimum received · 0.5% slippage</dt>
          <dd>
            {relayFormat(quote.minimumOut, route.decimals)} {route.symbol}
          </dd>
        </div>
        <div>
          <dt>Origin gas estimate · additional</dt>
          <dd>{feeLabel(quote.fees.originGas)}</dd>
        </div>
        <div>
          <dt>Relay fees · included in output</dt>
          <dd>{feeLabel(quote.fees.relayer)}</dd>
        </div>
        <div>
          <dt>Source balance · Relay estimate</dt>
          <dd>
            {quote.sourceBalance === null
              ? "Unavailable"
              : `${relayFormat(quote.sourceBalance, route.decimals)} ${route.symbol}`}
          </dd>
        </div>
        <div>
          <dt>Balance after amount · before gas</dt>
          <dd>
            {quote.sourceBalanceAfterPrincipal === null
              ? quote.sufficientPrincipal === false
                ? "Insufficient balance"
                : "Unavailable"
              : `${relayFormat(quote.sourceBalanceAfterPrincipal, route.decimals)} ${route.symbol}`}
          </dd>
        </div>
        <div>
          <dt>Transfer time estimate</dt>
          <dd>{quote.timeEstimateSeconds}s</dd>
        </div>
      </dl>
      <p>
        {expired
          ? "Refresh to see current fees and output."
          : "Refresh within 30 seconds. Output includes route fees; origin gas is additional. Gas balance has not been checked."}
      </p>
      <details>
        <summary>Fee breakdown and status</summary>
        <dl>
          {quote.fees.destinationGas && (
            <div>
              <dt>Destination gas · included in Relay fees</dt>
              <dd>{feeLabel(quote.fees.destinationGas)}</dd>
            </div>
          )}
          {quote.fees.service && (
            <div>
              <dt>Solver service · included in Relay fees</dt>
              <dd>{feeLabel(quote.fees.service)}</dd>
            </div>
          )}
          <div>
            <dt>App fee</dt>
            <dd>
              {quote.fees.app
                ? feeLabel(quote.fees.app)
                : "Not separately reported"}
            </dd>
          </div>
          <div>
            <dt>Source steps</dt>
            <dd>
              {quote.steps
                .map((s) =>
                  s === "approval" ? "Token approval" : "Wallet deposit",
                )
                .join(" → ")}
            </dd>
          </div>
        </dl>
        <Button
          variant="outline"
          disabled={busy || !onStatus}
          onClick={onStatus}
        >
          <RefreshCw size={15} /> Check Relay status
        </Button>
        {record.status && (
          <p>
            Relay reports: {record.status.providerState}. Destination receipt
            has not been independently confirmed.
          </p>
        )}
      </details>
    </div>
  );
}
