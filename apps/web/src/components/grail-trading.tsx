"use client";
import { formatUnits } from "viem";
import dynamic from "next/dynamic";
import { useNetwork } from "./network-settings";
const WalletTrade = dynamic(() => import("./grail-wallet-trade"), {
  ssr: false,
});
import { GrailReward } from "./grail-reward";
import {
  evmChains,
  type EvmChainId,
  type GrailToken,
  type GrailOrderView,
  type GrailMarket,
} from "@collectible/domain";

export type TradeProps = {
  token: GrailToken;
  configured: boolean;
  market: GrailMarket | null;
  blocker: string | null;
};
export function GrailTrading(props: TradeProps) {
  const { network } = useNetwork();
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
        <GrailReward token={token} />
        {network === "mainnet" && props.configured && (
          <WalletTrade {...props} />
        )}
        <section className="token-information">
          <h2>Token details</h2>
          <dl>
            <dt>Network</dt>
            <dd>{chain.name}</dd>
            <dt>Payment token</dt>
            <dd>{props.market?.paymentSymbol ?? "Unavailable"}</dd>
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
          <a href={token.url} target="_blank" rel="noreferrer">
            Redemption on Grail ↗
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
