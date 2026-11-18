"use client";
import Link from "next/link";
import {
  indicativeTokens,
  type GrailToken,
  type GrailRewardDetails,
} from "@collectible/domain";
import { api } from "@/lib/trpc";
import { usd } from "@/lib/utils";

const number = (value: string | number) =>
  Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
const date = (value: string | number) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

function TokenHistory({ data }: { data: GrailRewardDetails }) {
  const points = data.history;
  if (points.length < 2) return null;
  const first = points[0]!,
    last = points.at(-1)!;
  const prices = points.map((p) => p.price),
    min = Math.min(...prices),
    max = Math.max(...prices);
  const path = points
    .map(
      (p) =>
        `${8 + ((p.time - first.time) / (last.time - first.time)) * 284},${90 - ((p.price - min) / (max - min || 1)) * 78}`,
    )
    .join(" ");
  return (
    <figure className="grail-price-chart">
      <figcaption>
        <span>Token price · USD</span>
        <span>
          {date(first.time * 1000)} – {date(last.time * 1000)}
        </span>
      </figcaption>
      <div className="grail-chart-scale">
        <span>
          High ${max.toLocaleString("en-US", { maximumFractionDigits: 6 })}
        </span>
        <span>
          Low ${min.toLocaleString("en-US", { maximumFractionDigits: 6 })}
        </span>
      </div>
      <svg
        viewBox="0 0 300 104"
        role="img"
        aria-label={`${points.length} recorded token prices, ${date(first.time * 1000)} to ${date(last.time * 1000)}, ${usd(min)} to ${usd(max)}`}
      >
        <line
          x1="8"
          y1="90"
          x2="292"
          y2="90"
          stroke="currentColor"
          opacity=".2"
        />
        <polyline
          points={path}
          fill="none"
          stroke="#59c6fa"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </figure>
  );
}

export function GrailReward({
  token,
  payout = null,
  side,
}: {
  token: GrailToken;
  payout?: string | null;
  side?: "yes" | "no";
}) {
  const query = api.grailReward.useQuery(
    { chain: token.chainId, address: token.address },
    { staleTime: 30000, refetchInterval: 60000 },
  );
  const data = query.data?.data;
  const amount = indicativeTokens(payout, data?.priceUsd ?? null);
  return (
    <aside
      className="reward-target grail-reward panel"
      aria-label={`${token.name} token reward`}
    >
      {side && (
        <div className="reward-result-heading">
          <h2>If {side.toUpperCase()} wins</h2>
          <strong>
            {payout ? usd(payout) : "—"} <small>USD</small>
          </strong>
        </div>
      )}
      <div className="grail-reward-identity">
        {token.image && (
          <img src={token.image} alt="" referrerPolicy="no-referrer" />
        )}
        <div>
          <h3>{token.name}</h3>
          <span>
            {token.symbol} · {token.chain}
          </span>
        </div>
      </div>
      {data ? (
        <>
          <div className="grail-token-amount" aria-live="polite">
            {side ? (
              <>
                <strong>{amount ? `≈ ${number(amount)}` : "—"}</strong>
                <span>{token.symbol} at spot price</span>
              </>
            ) : (
              <>
                <strong>
                  {data.priceUsd
                    ? `$${Number(data.priceUsd).toLocaleString("en-US", { maximumFractionDigits: 8 })}`
                    : "—"}
                </strong>
                <span>USD per {token.symbol}</span>
              </>
            )}
          </div>
          {side && (
            <p className="reward-data-note">
              {data.priceUsd
                ? `$${Number(data.priceUsd).toLocaleString("en-US", { maximumFractionDigits: 8 })} per token`
                : "Price unavailable"}
            </p>
          )}
          <details className="grail-vault-details" open={!side}>
            <summary>
              Chart & vault · {data.reserves.length}{" "}
              {data.reserves.length === 1 ? "collectible" : "collectibles"}
            </summary>
            <TokenHistory data={data} />
            {data.reserves.map((r) => (
              <div className="grail-vault-item" key={r.id}>
                {r.image && (
                  <img
                    src={r.image}
                    alt={r.name}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                )}
                <div>
                  <h4>{r.name}</h4>
                  <strong>
                    {number(r.tokensPerItem)} {token.symbol} = 1 collectible
                  </strong>
                  <span>
                    {r.vaulted} vaulted · {r.available} available
                  </span>
                </div>
              </div>
            ))}
            {data.reserves.length === 0 && (
              <p className="reward-data-note">
                Grail has not published a reserve for this token.
              </p>
            )}
          </details>
          <details className="reward-assumptions">
            <summary>Fees & redemption</summary>
            <p>
              Estimates exclude fees, gas and price impact. Redeeming a
              collectible requires its full token threshold and available
              inventory on Grail.
            </p>
            <a href={token.url} target="_blank" rel="noreferrer">
              Grail source & redemption requirements
            </a>
          </details>
        </>
      ) : (
        <div className="reward-data-note" role="status">
          {query.isPending ? (
            "Loading token price and vault…"
          ) : (
            <>
              Token details unavailable.{" "}
              <button
                className="text-button"
                onClick={() => void query.refetch()}
              >
                Retry
              </button>
            </>
          )}
        </div>
      )}
      {side && (
        <Link
          className="reward-token-link"
          href={`/tokens/${token.chainId}/${token.address}`}
        >
          Explore {token.symbol}
        </Link>
      )}
    </aside>
  );
}
