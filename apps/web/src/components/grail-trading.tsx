"use client";
import dynamic from "next/dynamic";
import { formatUnits } from "viem";
import {
  evmChains,
  type EvmChainId,
  type GrailToken,
  type GrailOrderView,
} from "@collectible/domain";
import { Button } from "./ui/button";

const WalletTrade = dynamic(() => import("./grail-wallet-trade"), {
  ssr: false,
  loading: () => <p role="status">Loading wallet…</p>,
});
export type TradeProps = {
  token: GrailToken;
  configured: boolean;
  quoteConfigured: boolean;
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
                Spend · {chain.paymentSymbol}
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
            <dd>{chain.paymentSymbol}</dd>
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
        {formatUnits(BigInt(q.sellAmount), 6)} {q.paymentSymbol}
      </dd>
      <dt>Estimated tokens</dt>
      <dd>
        {formatUnits(BigInt(q.buyAmount), q.decimals)} {q.symbol}
      </dd>
      <dt>Minimum received</dt>
      <dd>
        {formatUnits(BigInt(q.minBuyAmount), q.decimals)} {q.symbol}
      </dd>
      {q.fees.map((f, i) => (
        <div className="token-quote-fee" key={i}>
          <dt>{f.label}</dt>
          <dd>
            {formatUnits(BigInt(f.amount), f.decimals)} {f.symbol}
          </dd>
        </div>
      ))}
      <dt>Expires</dt>
      <dd>{new Date(q.expiresAt).toLocaleTimeString()}</dd>
    </dl>
  );
}
