"use client";
import dynamic from "next/dynamic";
import { formatUnits } from "viem";
import {
  evmChains,
  type EvmChainId,
  type GrailToken,
  type GrailOrderView,
  type GrailMarket,
} from "@collectible/domain";
import { Button } from "./ui/button";

const WalletTrade = dynamic(() => import("./grail-wallet-trade"), {
  ssr: false,
  loading: () => <p role="status">Loading wallet…</p>,
});
export type TradeProps = {
  token: GrailToken;
  configured: boolean;
  market: GrailMarket | null;
  blocker: string | null;
};
export function GrailTrading(props: TradeProps) {
  const { token } = props,
    chain = evmChains[token.chainId as EvmChainId];
  return (
    <>
      <header className="token-heading">
        {token.image && (
          <img
            src={token.image}
            alt={token.name}
            referrerPolicy="no-referrer"
          />
        )}
        <div>
          <h1>{token.name}</h1>
          <p>
            {token.symbol} · {chain.name}
          </p>
        </div>
      </header>
      <div className="token-trade-layout">
        <section className="token-purchase panel">
          <h2>Buy {token.symbol}</h2>
          {props.configured ? (
            <WalletTrade {...props} />
          ) : (
            <>
              <label className="token-amount-label">
                Spend · {props.market?.paymentSymbol ?? "Unavailable"}
                <input inputMode="decimal" placeholder="0.00" disabled />
              </label>
              <Button disabled>Wallet connection unavailable</Button>
              <p role="status">
                Sign-in setup is required before connecting an EVM wallet.
              </p>
            </>
          )}
        </section>
        <section className="token-information">
          <h2>Token details</h2>
          <dl>
            <dt>Network</dt>
            <dd>{chain.name}</dd>
            <dt>Payment token</dt>
            <dd>{props.market?.paymentSymbol ?? "Unavailable"}</dd>
            <dt>Gas sponsorship</dt>
            <dd>Off</dd>
            <dt>Contract</dt>
            <dd>
              <a
                href={`${chain.explorer}/token/${token.address}`}
                target="_blank"
                rel="noreferrer"
              >
                {token.address}
              </a>
            </dd>
          </dl>
          <details className="token-history">
            <summary>Use Gemini winnings</summary>
            <ol>
              <li>Link Gemini and select an available settled USD amount.</li>
              <li>
                Review USD to USDC conversion and fees in your Gemini account.
              </li>
              <li>
                Withdraw to your own wallet using an account-supported network.
              </li>
              <li>
                Review a bridge quote to {chain.name} if needed, including gas
                and minimum received.
              </li>
              {props.market?.paymentSymbol !== "USDC" && (
                <li>
                  Convert to{" "}
                  {props.market?.paymentSymbol ?? "the pool’s payment token"}{" "}
                  using an eligible, verified route.
                </li>
              )}
              <li>
                Review this token purchase and sign each required approval.
              </li>
            </ol>
            <p>
              Gemini withdrawals and bridge quotes are not connected yet. No
              funds will move here. You can use an already funded wallet; keep
              ETH for gas.
            </p>
          </details>
          <p>
            Fractional collectible token. Physical redemption depends on Grail’s
            requirements and inventory.
          </p>
          <a href={token.url} target="_blank" rel="noreferrer">
            Collectible and redemption details ↗
          </a>
        </section>
      </div>
    </>
  );
}
export function TradeQuote({ order }: { order: GrailOrderView }) {
  const q = order.quote;
  return (
    <dl className="token-quote">
      <dt>Pay, including quoted fees</dt>
      <dd>
        {formatUnits(BigInt(q.sellAmount), q.paymentDecimals)} {q.paymentSymbol}
      </dd>
      <dt>Estimated tokens</dt>
      <dd>
        {formatUnits(BigInt(q.buyAmount), q.decimals)} {q.symbol}
      </dd>
      <dt>Minimum received</dt>
      <dd>
        {formatUnits(BigInt(q.minBuyAmount), q.decimals)} {q.symbol}
      </dd>
      <dt>Pool fee (included)</dt>
      <dd>{q.feePips / 10000}%</dd>
      <dt>Gas</dt>
      <dd>Paid separately in ETH</dd>
      <dt>Route</dt>
      <dd>Uniswap {q.protocol}</dd>
      <dt>Expires</dt>
      <dd>{new Date(q.expiresAt).toLocaleTimeString()}</dd>
    </dl>
  );
}
