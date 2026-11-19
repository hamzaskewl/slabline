"use client";
import { Select } from "./ui/select";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";
import { useQueryClient } from "@tanstack/react-query";
import {
  units,
  money,
  type DemoAccountView,
  type DemoCollectible,
  type DemoPosition,
  activeDemoPosition,
} from "@collectible/domain";
import { ArrowUpRight } from "lucide-react";
import { MarketArtwork } from "./market-artwork";
import { PositionRewards } from "./position-rewards";
import { CardImage } from "./card-image";
import { CardValue } from "./card-value";
import { PortfolioOverview } from "./portfolio-overview";
import { WalletCollection } from "./wallet-collection";
import { usePrivateRead } from "@/lib/use-private-read";
import { usd } from "@/lib/utils";
import { useNetwork } from "./network-settings";
import { Button } from "./ui/button";

export function useDemoAction() {
  const auth = usePrivy(),
    { network } = useNetwork(),
    query = useQueryClient();
  const current = useRef({ owner: auth.user?.id, network });
  useEffect(() => {
    current.current = { owner: auth.user?.id, network };
  }, [auth.user?.id, network]);
  const lock = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setError("");
  }, [auth.user?.id, network]);
  async function request<T>(body: object, path = "/api/demo"): Promise<T> {
    const owner = auth.user?.id;
    const token = await auth.getAccessToken();
    if (
      !owner ||
      !token ||
      current.current.owner !== owner ||
      current.current.network !== "devnet"
    )
      throw new Error("Sign in and choose Devnet in Settings.");
    const r = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Market-Network": "devnet",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(95000),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error ?? "Request failed. Please retry.");
    if (current.current.owner !== owner || current.current.network !== "devnet")
      throw new Error(
        "Account or network changed. Reopen your saved activity.",
      );
    await query.invalidateQueries({
      queryKey: ["private-read", owner, "/api/demo"],
    });
    if (path === "/api/wallet/verify")
      await query.invalidateQueries({
        queryKey: ["private-read", owner, "/api/wallet/links"],
      });
    return result as T;
  }
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { ...auth, network, busy, error, run, request };
}

export function DemoOrder({
  eventTicker,
  symbol,
  side,
  stake,
  shares,
  replay,
}: {
  eventTicker: string;
  symbol: string;
  side: "yes" | "no";
  stake: string;
  shares: string | null;
  replay: boolean;
}) {
  const a = useDemoAction(),
    [review, setReview] = useState(false),
    [receipt, setReceipt] = useState("");
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    setReview(false);
    setReceipt("");
    key.current = crypto.randomUUID();
  }, [symbol, side, stake, shares, a.user?.id, a.network]);
  if (a.network !== "devnet") return null;
  return (
    <div className="demo-order">
      {!a.authenticated ? (
        <Button className="ticket-action" onClick={a.login}>
          Log in to predict
        </Button>
      ) : (
        <>
          <Button
            className={`ticket-action trade-submit ${side}`}
            disabled={!shares || Number(shares) <= 0 || a.busy}
            onClick={() => {
              if (!review) {
                setReview(true);
                return;
              }
              void a.run(async () => {
                const result = await a.request<DemoAccountView>({
                  action: "buy",
                  key: key.current,
                  eventTicker,
                  symbol,
                  side,
                  stake,
                  replay,
                  minimumContracts: shares,
                });
                const position = result.positions.find(
                  (p) =>
                    p.symbol === symbol &&
                    p.side === side &&
                    p.state === "open",
                );
                setReceipt(
                  position
                    ? `${Number(position.quantity).toLocaleString()} shares added · ${usd(position.cost)}`
                    : "Trade saved",
                );
                setReview(false);
                key.current = crypto.randomUUID();
              });
            }}
          >
            {a.busy
              ? "Submitting…"
              : review
                ? "Confirm trade"
                : `Buy ${side === "yes" ? "Yes" : "No"}`}
          </Button>
          <p className="trade-confirmation" aria-live="polite">
            {review
              ? `Up to ${usd(stake)} · ${Number(shares).toLocaleString()} estimated shares`
              : "Demo trade · no real funds"}
          </p>
        </>
      )}
      {a.error && <p role="alert">{a.error}</p>}
      {receipt && (
        <p role="status">
          {receipt} · <Link href="/portfolio">View position</Link>
        </p>
      )}
    </div>
  );
}

export function DemoPortfolio({
  compact = false,
  collection = false,
}: {
  compact?: boolean;
  collection?: boolean;
}) {
  const a = useDemoAction(),
    snapshot = usePrivateRead<DemoAccountView>(
      "/api/demo",
      a.network === "devnet",
    );
  const [tab, setTab] = useState("all"),
    [positionFilter, setPositionFilter] = useState("all");
  const key = useRef(crypto.randomUUID());
  if (a.network !== "devnet") return null;
  if (!a.authenticated)
    return (
      <section className="account-empty panel">
        <h2>
          {collection ? "Your collection" : "Your portfolio, all together"}
        </h2>
        <p>Track predictions, winning rewards and collected cards.</p>
        <Button onClick={a.login}>Log in</Button>
      </section>
    );
  const data = snapshot.data,
    cards = data?.collectibles.filter((c) => c.state !== "cancelled") ?? [],
    positions = data?.positions ?? [];
  const wins = positions.filter(
    (p) => p.reward && p.reward.state !== "claimed",
  );
  const rewardResults = positions.filter(
    (p) => p.state === "won" && p.reward?.state !== "claimed",
  );
  const openCost = positions
    .filter((p) => p.state === "open")
    .reduce((sum, p) => sum + units(p.cost), 0n);
  const cardCost = cards.reduce((sum, c) => sum + units(c.cost), 0n);
  const rewardValue = wins.reduce(
    (sum, p) =>
      sum +
      units(p.reward!.budget) -
      cards
        .filter((c) => c.rewardPositionId === p.id)
        .reduce((v, c) => v + units(c.cost), 0n),
    0n,
  );
  const total = money(
    units(data?.balance ?? "0") + openCost + cardCost + rewardValue,
  );
  const visiblePositions = positions.filter(
    (p) =>
      positionFilter === "all" ||
      (positionFilter === "active"
        ? activeDemoPosition(p)
        : !activeDemoPosition(p)),
  );
  return (
    <div className="portfolio-view">
      {(a.error || snapshot.error) && (
        <p className="account-error" role="alert">
          {a.error || snapshot.error?.message}{" "}
          <button
            className="text-button"
            onClick={() => void snapshot.refetch()}
          >
            Retry
          </button>
        </p>
      )}
      {!collection && (
        <PortfolioOverview
          compact={compact}
          balance={data?.balance}
          total={data ? total : undefined}
          predictionValue={money(openCost)}
          collectibleValue={money(cardCost)}
          rewardValue={money(rewardValue)}
          history={data?.history}
          actions={
            <>
              <Button
                disabled={a.busy || !data}
                onClick={() =>
                  void a.run(async () => {
                    await a.request({ action: "topup", key: key.current });
                    key.current = crypto.randomUUID();
                  })
                }
              >
                Add $100
              </Button>
            </>
          }
        />
      )}
      {rewardResults.length > 0 && (
        <section className="portfolio-rewards" aria-label="Winning rewards">
          {rewardResults.map((p) => (
            <div className="won-reward" key={p.id}>
              <PositionArtwork position={p} />
              <div>
                <h3>You won {usd(p.reward?.budget ?? p.payout ?? "0")}</h3>
                <p>
                  {p.label} · {p.side.toUpperCase()} ·{" "}
                  {!p.reward
                    ? "Earlier payout · available in your balance"
                    : p.reward.state === "available"
                      ? "Choose your cards"
                      : "Cards selected · transfer pending"}
                </p>
              </div>
              <PositionRewards position={p} />
            </div>
          ))}
        </section>
      )}
      {!compact && (
        <section className="portfolio-holdings panel">
          {!collection && (
            <div className="holdings-toolbar">
              <div className="holdings-tabs" aria-label="Portfolio holdings">
                {[
                  ["all", "All holdings"],
                  ["predictions", "Predictions"],
                  ["collectibles", "Collectibles"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={tab === value}
                    onClick={() => setTab(value!)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                className="text-button"
                disabled={a.busy || snapshot.isFetching}
                onClick={() =>
                  void a.run(async () => {
                    await a.request({ action: "refresh" });
                  })
                }
              >
                Refresh
              </button>
            </div>
          )}
          {snapshot.isPending && <p role="status">Loading your holdings…</p>}
          {!collection && tab !== "collectibles" && (
            <div className="portfolio-section">
              <div className="portfolio-section-heading">
                <h2>
                  Prediction positions <span>{positions.length}</span>
                </h2>
                <Select
                  aria-label="Position status"
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                >
                  <option value="all">All positions</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </Select>
              </div>
              {visiblePositions.length ? (
                <div className="position-list">
                  {visiblePositions.map((p) => (
                    <PositionRow position={p} key={p.id}>
                      {p.state === "open" ? (
                        <>
                          <SellPosition position={p} />
                          <PositionRewards position={p} preview />
                        </>
                      ) : p.state === "won" ? (
                        <PositionRewards position={p} />
                      ) : null}
                    </PositionRow>
                  ))}
                </div>
              ) : (
                <div className="holdings-empty">
                  <p>
                    No {positionFilter === "all" ? "" : positionFilter}{" "}
                    positions yet.
                  </p>
                  <Link className="button button-outline button-pill" href="/">
                    Explore markets
                  </Link>
                </div>
              )}
            </div>
          )}
          {(collection || tab !== "predictions") && (
            <div className="portfolio-section">
              <div className="portfolio-section-heading">
                <h2>
                  {collection ? "Your collection" : "Collectibles"}{" "}
                  <span>{cards.length}</span>
                </h2>
                <Link
                  className="button button-outline button-pill"
                  href="/rewards"
                >
                  Browse rewards
                </Link>
              </div>
              {cards.length ? (
                <div className="collection-list">
                  {cards.map((c) => (
                    <article className="collection-row" key={c.id}>
                      <CardImage src={c.image} alt={c.name} />
                      <div className="collection-copy">
                        <h3>{c.name}</h3>
                        <p>
                          {c.source === "grail" ? "Grail" : "Collector Crypt"} ·{" "}
                          {c.rewardPositionId ? "Won reward" : "Collected"}
                        </p>
                        <CardValue valuation={c.valuation} />
                      </div>
                      <div className="collection-value">
                        <strong>{usd(c.cost)}</strong>
                        <span>
                          {c.state === "confirmed"
                            ? "In your collection"
                            : "Transfer pending"}
                        </span>
                      </div>
                      <div className="collection-actions">
                        {c.state === "confirmed" && c.mint ? (
                          <a
                            className="text-link"
                            href={`https://explorer.solana.com/address/${c.mint}?cluster=devnet`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View asset <ArrowUpRight size={15} />
                          </a>
                        ) : (
                          <DemoMintActions item={c} />
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="holdings-empty">
                  <p>Your collected cards will appear here.</p>
                </div>
              )}
              <WalletCollection
                embedded
                excludeMints={cards.flatMap((c) => (c.mint ? [c.mint] : []))}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
export function PositionArtwork({
  position,
}: {
  position: Pick<DemoPosition, "artwork" | "label">;
}) {
  return (
    <span
      className="position-artwork"
      data-empty={!position.artwork?.length}
      aria-hidden="true"
    >
      {position.artwork?.map((image) => (
        <MarketArtwork key={image.src} {...image} />
      ))}
    </span>
  );
}
export function PositionRow({
  position: p,
  children,
}: {
  position: DemoPosition;
  children: ReactNode;
}) {
  return (
    <div className="position-row">
      <PositionArtwork position={p} />
      <div className="position-identity">
        <Link
          href={
            p.replay
              ? "/demo"
              : `/markets/${p.eventTicker}?contract=${p.symbol}&side=${p.side}`
          }
        >
          {p.eventTitle}
        </Link>
        <h3>{p.label}</h3>
        <p>
          {Number(p.quantity).toLocaleString()} shares · {usd(p.cost)} paid
          {p.replay ? " · Replay" : ""}
        </p>
      </div>
      <div className="position-result">
        <span className={`position-side ${p.side}`}>
          {p.side === "yes" ? "Yes" : "No"}
        </span>
        <strong className={p.state === "won" ? "positive" : ""}>
          {p.state === "open"
            ? usd(p.quantity)
            : p.state === "sold"
              ? usd(p.saleProceeds ?? "0")
              : usd(p.payout ?? "0")}
        </strong>
        <span>
          {p.state === "open"
            ? "Potential reward"
            : p.state === "won"
              ? p.reward?.state === "claimed"
                ? "Claimed"
                : p.reward?.state === "allocated"
                  ? "Transfer pending"
                  : "Won · unclaimed"
              : p.state === "sold"
                ? "Sold"
                : p.state === "refunded"
                  ? "Refunded"
                  : "Lost"}
        </span>
      </div>
      <div className="position-actions">{children}</div>
    </div>
  );
}
function SellPosition({ position }: { position: DemoPosition }) {
  const a = useDemoAction(),
    [quote, setQuote] = useState<{ proceeds: string; at: number } | null>(null),
    key = useRef(crypto.randomUUID());
  useEffect(() => {
    setQuote(null);
    key.current = crypto.randomUUID();
  }, [position.id, a.user?.id, a.network]);
  return (
    <div className="sell-position">
      <Button
        size="sm"
        variant="outline"
        disabled={a.busy}
        onClick={() =>
          void a.run(async () => {
            if (!quote || Date.now() - quote.at > 15000) {
              const result = await a.request<{ proceeds: string }>({
                action: "sell-quote",
                id: position.id,
              });
              setQuote({ proceeds: result.proceeds, at: Date.now() });
              return;
            }
            await a.request({
              action: "sell",
              id: position.id,
              key: key.current,
              minimumProceeds: quote.proceeds,
            });
            setQuote(null);
          })
        }
      >
        {a.busy ? "Please wait…" : quote ? "Confirm sale" : "Sell"}
      </Button>
      {quote && <span>{usd(quote.proceeds)} estimated</span>}
      {a.error && <p role="alert">{a.error}</p>}
    </div>
  );
}
export function DemoReplayControls() {
  const a = useDemoAction(),
    snapshot = usePrivateRead<DemoAccountView>(
      "/api/demo",
      a.network === "devnet",
    );
  const [selected, setSelected] = useState(""),
    [result, setResult] = useState("yes");
  const positions =
    snapshot.data?.positions.filter((p) => p.replay && p.state === "open") ??
    [];
  const position = positions.find((p) => p.id === selected) ?? positions[0];
  if (a.network !== "devnet" || !a.authenticated || !position) return null;
  return (
    <div className="settings-result">
      <h3>Finish a replay</h3>
      <Select
        aria-label="Replay position"
        value={position.id}
        onChange={(e) => setSelected(e.target.value)}
      >
        {positions.map((p) => (
          <option value={p.id} key={p.id}>
            {p.label} · {p.side.toUpperCase()} · {Number(p.quantity)} shares
          </option>
        ))}
      </Select>
      <div className="replay-controls">
        <Select
          aria-label="Replay result"
          value={result}
          onChange={(e) => setResult(e.target.value)}
        >
          <option value="yes">Yes wins</option>
          <option value="no">No wins</option>
          <option value="void">Void · refund stake</option>
        </Select>
        <Button
          disabled={a.busy}
          onClick={() =>
            void a.run(async () => {
              await a.request({ action: "replay", id: position.id, result });
            })
          }
        >
          Apply result
        </Button>
      </div>
      {a.error && <p role="alert">{a.error}</p>}
      <Link className="text-link" href="/portfolio">
        View portfolio <ArrowUpRight size={15} />
      </Link>
    </div>
  );
}

export function MarketPositionStatus({ symbol }: { symbol: string }) {
  const { network } = useNetwork(),
    snapshot = usePrivateRead<DemoAccountView>(
      "/api/demo",
      network === "devnet",
    );
  const position =
    snapshot.data?.positions.find(
      (p) => p.symbol === symbol && p.reward && p.reward.state !== "claimed",
    ) ??
    snapshot.data?.positions.find(
      (p) => p.symbol === symbol && p.state === "open",
    );
  if (network !== "devnet" || !position) return null;
  return (
    <div className="ticket-position">
      <strong>
        {position.reward
          ? `You won ${usd(position.reward.budget)}`
          : `You own ${Number(position.quantity).toLocaleString()} ${position.side.toUpperCase()} shares`}
      </strong>
      {position.reward ? (
        <PositionRewards position={position} />
      ) : (
        <SellPosition position={position} />
      )}
    </div>
  );
}

export function DemoMintActions({
  item,
  onCancel,
}: {
  item: DemoCollectible;
  onCancel?: () => void;
}) {
  const a = useDemoAction(),
    { wallets } = useWallets(),
    { signTransaction } = useSignTransaction();
  const [view, update] = useState(item);
  useEffect(() => update(item), [item]);
  const check = useRef(a.request);
  check.current = a.request;
  useEffect(() => {
    if (
      view.state !== "submitted" ||
      !a.authenticated ||
      a.network !== "devnet"
    )
      return;
    let stopped = false,
      reading = false,
      attempts = 0;
    const timer = setInterval(async () => {
      if (reading || attempts++ >= 20) return;
      reading = true;
      try {
        const result = await check.current<DemoCollectible>({
          action: "check",
          id: item.id,
        });
        if (!stopped) update(result);
      } catch {
        /* Saved activity keeps explicit recovery controls available. */
      } finally {
        reading = false;
      }
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [view.state, item.id, a.authenticated, a.network, a.user?.id]);
  const wallet = wallets.find((w) => w.address === item.wallet);
  if (view.state === "cancelled")
    return (
      <p role="status">
        {item.rewardPositionId
          ? "Returned to your reward budget."
          : "Reservation refunded."}
      </p>
    );
  if (view.state === "confirmed")
    return (
      <p role="status">
        Card received. <Link href="/collection">View collection</Link>
      </p>
    );
  return (
    <div className="demo-mint-actions">
      {view.state === "submitted" && (
        <button
          className="text-button"
          disabled={a.busy}
          onClick={() =>
            void a.run(async () => {
              update(
                await a.request<DemoCollectible>({
                  action: "retry",
                  id: item.id,
                }),
              );
            })
          }
        >
          Retry submission
        </button>
      )}
      {["reserved", "prepared"].includes(view.state) && (
        <Button
          size="sm"
          disabled={a.busy || !wallet}
          onClick={() =>
            void a.run(async () => {
              const prepared = await a.request<DemoCollectible>({
                action: "prepare",
                id: item.id,
              });
              update(prepared);
              if (!prepared.unsignedBase64 || !wallet)
                throw new Error("Connect the destination wallet to continue.");
              const signed = await signTransaction({
                wallet,
                transaction: Uint8Array.from(
                  atob(prepared.unsignedBase64),
                  (c) => c.charCodeAt(0),
                ),
                chain: "solana:devnet",
              });
              update(
                await a.request<DemoCollectible>({
                  action: "submit",
                  id: item.id,
                  signedBase64: btoa(
                    String.fromCharCode(...signed.signedTransaction),
                  ),
                }),
              );
            })
          }
        >
          Mint to wallet
        </Button>
      )}
      {view.state !== "confirmed" && (
        <button
          className="text-button"
          disabled={a.busy}
          onClick={() =>
            void a.run(async () => {
              update(
                await a.request<DemoCollectible>({
                  action: "check",
                  id: item.id,
                }),
              );
            })
          }
        >
          Check transfer
        </button>
      )}
      {view.state !== "confirmed" && (
        <button
          className="text-button"
          disabled={a.busy}
          onClick={() =>
            void a.run(async () => {
              const result = await a.request<DemoAccountView>({
                action: "refund",
                id: item.id,
              });
              const saved = result.collectibles.find((c) => c.id === item.id);
              if (saved) update(saved);
              onCancel?.();
            })
          }
        >
          {item.rewardPositionId ? "Remove selection" : "Cancel & refund"}
        </button>
      )}
      {!wallet && <Link href="/wallet">Connect destination wallet</Link>}
      {a.error && <p role="alert">{a.error}</p>}
    </div>
  );
}
