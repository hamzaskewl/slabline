"use client";
import { useSlablineAuth } from "./sign-in-dialog";
import { Select } from "./ui/select";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useConnectWallet } from "@privy-io/react-auth";
import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";
import { useQueryClient } from "@tanstack/react-query";
import {
  units,
  money,
  type DemoAccountView,
  type DemoCollectible,
  type DemoPosition,
  activeDemoPosition,
  demoCollectibleValue,
  DEMO_GRAIL,
} from "@collectible/domain";
import { ArrowUpRight } from "lucide-react";
import { MarketArtwork } from "./market-artwork";
import { PositionRewards } from "./position-rewards";
import { PositionShare } from "./position-share";
import { CardImage } from "./card-image";
import { CardValue } from "./card-value";
import { PortfolioOverview } from "./portfolio-overview";
import { WalletCollection } from "./wallet-collection";
import { usePrivateRead } from "@/lib/use-private-read";
import { HoldingSection } from "./holding-section";
import { PortfolioPacks } from "./portfolio-packs";
import { BalanceActions } from "./balance-actions";
import { UsdcAmount } from "./usdc-amount";
import { usd, number } from "@/lib/utils";
import { useNetwork } from "./network-settings";
import { Button } from "./ui/button";

export function useDemoAction() {
  const auth = useSlablineAuth(),
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
  targetMint,
  eventTicker,
  symbol,
  side,
  stake,
  shares,
  replay,
  rehearsal,
  onFilled,
}: {
  targetMint?: string;
  eventTicker: string;
  symbol: string;
  side: "yes" | "no";
  stake: string;
  shares: string | null;
  replay: boolean;
  rehearsal?: "grail";
  onFilled?: () => void;
}) {
  const a = useDemoAction(),
    [review, setReview] = useState(false),
    [receipt, setReceipt] = useState("");
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    setReview(false);
    setReceipt("");
    key.current = crypto.randomUUID();
  }, [
    symbol,
    side,
    stake,
    shares,
    targetMint,
    rehearsal,
    a.user?.id,
    a.network,
  ]);
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
                  targetMint,
                  key: key.current,
                  eventTicker,
                  symbol,
                  side,
                  stake,
                  replay,
                  rehearsal,
                  minimumContracts: shares,
                });
                const position = result.positions.find(
                  (p) =>
                    p.symbol === symbol &&
                    p.side === side &&
                    p.state === "open" &&
                    p.replay === replay &&
                    p.rehearsal === rehearsal,
                );
                setReceipt(
                  position
                    ? `${number(position.quantity)} shares held · ${usd(position.cost)}`
                    : "Trade saved",
                );
                setReview(false);
                onFilled?.();
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
              ? `Up to ${usd(stake)} · ${number(shares ?? "0")} estimated shares`
              : null}
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
  const [positionFilter, setPositionFilter] = useState("active");
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
  const openCost = positions
    .filter((p) => p.state === "open")
    .reduce((sum, p) => sum + units(p.cost), 0n);
  const grailHoldings = positions.filter((p) => p.grailHolding);
  const cardCost =
    cards.reduce((sum, c) => sum + demoCollectibleValue(c), 0n) +
    grailHoldings.reduce((sum, p) => sum + units(p.grailHolding!.cost), 0n);
  const rewardValue = wins.reduce(
    (sum, p) =>
      sum +
      units(p.reward!.budget) -
      (p.reward!.remainderCredited ? units(p.reward!.remainder) : 0n) -
      cards
        .filter((c) => c.rewardPositionId === p.id)
        .reduce((v, c) => v + units(c.cost) - units(c.topUp ?? "0"), 0n),
    0n,
  );
  const total = money(
    units(data?.balance ?? "0") +
      units(data?.packValue ?? "0") +
      openCost +
      cardCost +
      rewardValue,
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
          packValue={data?.packValue}
          history={data?.history}
          actions={<BalanceActions balance={data?.balance} />}
        />
      )}
      {!compact && (
        <section className="portfolio-holdings panel">
          <div className="holdings-toolbar">
            <h2>All holdings</h2>
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
          <HoldingSection
            title="Grail holdings"
            count={grailHoldings.length}
            storageKey={`holdings:${a.user?.id}:${a.network}:grail`}
          >
            {grailHoldings.length ? (
              grailHoldings.map((p) => (
                <div className="collection-row grail-holding-row" key={p.id}>
                  <CardImage src={DEMO_GRAIL.image} alt={DEMO_GRAIL.name} />
                  <div className="collection-copy">
                    <h3>{p.grailHolding!.symbol}</h3>
                    <p>{number(p.grailHolding!.quantity)} tokens</p>
                  </div>
                  <div className="collection-value">
                    <strong>
                      <UsdcAmount value={p.grailHolding!.cost} />
                    </strong>
                  </div>
                  <a
                    className="button button-outline button-pill"
                    href={DEMO_GRAIL.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View Grail <ArrowUpRight size={15} />
                  </a>
                </div>
              ))
            ) : (
              <div className="holdings-empty">
                <p>Your Grail holdings will appear here.</p>
              </div>
            )}
          </HoldingSection>
          {snapshot.isPending && <p role="status">Loading your holdings…</p>}
          {!collection && (
            <HoldingSection
              title="Prediction positions"
              count={positions.length}
              storageKey={`holdings:${a.user?.id}:${a.network}:predictions`}
              actions={
                <Select
                  aria-label="Position status"
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                >
                  <option value="active">Active positions</option>
                  <option value="all">All positions</option>
                  <option value="closed">Closed positions</option>
                </Select>
              }
            >
              {visiblePositions.length ? (
                <div className="position-list">
                  {visiblePositions.map((p) => (
                    <PositionRow position={p} key={p.id}>
                      {p.state === "open" ? (
                        <>
                          <SellPosition position={p} />
                          <PositionRewards position={p} preview />
                        </>
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
            </HoldingSection>
          )}
          <HoldingSection
            title="Collectibles"
            count={cards.length}
            storageKey={`holdings:${a.user?.id}:${a.network}:collectibles`}
            actions={
              <Link
                className="button button-outline button-pill"
                href="/rewards"
              >
                Browse rewards
              </Link>
            }
          >
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
                      <strong>
                        <UsdcAmount value={c.cost} />
                      </strong>
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
          </HoldingSection>
          <HoldingSection
            title="Unplayed packs"
            storageKey={`holdings:${a.user?.id}:${a.network}:packs`}
          >
            <PortfolioPacks />
          </HoldingSection>
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
              ? `/demo${p.rehearsal === "grail" ? "?scenario=grail" : ""}`
              : `/markets/${p.eventTicker}?contract=${p.symbol}&side=${p.side}`
          }
        >
          {p.eventTitle}
        </Link>
        <h3>{p.label}</h3>
        <p>
          {number(p.quantity)} shares · {usd(p.cost)} paid
        </p>
      </div>
      <div className="position-result">
        <span className={`position-side ${p.side}`}>
          {p.side === "yes" ? "Yes" : "No"}
        </span>
        <div className="position-value-share">
          {p.state === "won" && <PositionRewards position={p} />}
          <strong className={p.state === "won" ? "positive" : ""}>
            <UsdcAmount
              value={
                p.state === "open"
                  ? p.quantity
                  : p.state === "sold"
                    ? (p.saleProceeds ?? "0")
                    : (p.payout ?? "0")
              }
            />
          </strong>
          <PositionShare
            reference={{ source: "demo", id: p.id }}
            revision={JSON.stringify(p)}
          />
        </div>
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
      {p.state !== "won" && <div className="position-actions">{children}</div>}
    </div>
  );
}
function SellPosition({ position }: { position: DemoPosition }) {
  const query = new URLSearchParams({ trade: "sell", side: position.side });
  if (position.rehearsal) query.set("scenario", position.rehearsal);
  if (!position.replay) query.set("contract", position.symbol);
  return (
    <Link
      className="button button-outline button-pill"
      href={`${position.replay ? "/demo" : `/markets/${position.eventTicker}`}?${query}`}
    >
      Sell
    </Link>
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

export function MarketPositionStatus({
  symbol,
  side,
  replay,
  rehearsal,
}: {
  symbol: string;
  side: "yes" | "no";
  replay: boolean;
  rehearsal?: "grail";
}) {
  const { network } = useNetwork(),
    snapshot = usePrivateRead<DemoAccountView>(
      "/api/demo",
      network === "devnet",
    );
  const matches =
    snapshot.data?.positions.filter(
      (p) =>
        p.symbol === symbol &&
        p.side === side &&
        p.replay === replay &&
        p.rehearsal === rehearsal,
    ) ?? [];
  const position =
    matches.find((p) => p.state === "open") ??
    matches.find((p) => p.reward?.state === "available") ??
    matches[0];
  if (network !== "devnet" || !position) return null;
  if (position.state === "open")
    return (
      <div className="ticket-held-summary">
        <span>
          {Number(position.quantity).toLocaleString("en-US", {
            maximumFractionDigits: 2,
          })}{" "}
          shares held
        </span>
        <span>
          Avg. entry{" "}
          {usd(
            money((units(position.cost) * 1000000n) / units(position.quantity)),
          )}
        </span>
        <PositionShare
          reference={{ source: "demo", id: position.id }}
          revision={JSON.stringify(position)}
        />
      </div>
    );
  return (
    <div className="ticket-position">
      <div className="position-value-share">
        <strong>
          {position.state === "open"
            ? `Payout if correct ${usd(position.quantity)}`
            : position.state === "won"
              ? `Winning payout ${position.payout ? usd(position.payout) : "—"}`
              : position.state === "sold"
                ? `Sale proceeds ${position.saleProceeds ? usd(position.saleProceeds) : "—"}`
                : position.state === "refunded"
                  ? `Refund ${position.payout ? usd(position.payout) : "—"}`
                  : position.state === "lost"
                    ? `Final payout ${position.payout ? usd(position.payout) : "—"}`
                    : "Settlement pending"}
        </strong>
        <PositionShare
          reference={{ source: "demo", id: position.id }}
          revision={JSON.stringify(position)}
        />
      </div>
      <dl className="held-position-facts" aria-label="Saved position">
        <div>
          <dt>{position.state === "open" ? "Shares held" : "Shares"}</dt>
          <dd>
            {Number(position.quantity).toLocaleString("en-US", {
              maximumFractionDigits: 2,
            })}
          </dd>
        </div>
        <div>
          <dt>Avg. entry</dt>
          <dd>
            {units(position.quantity) > 0n
              ? usd(
                  money(
                    (units(position.cost) * 1000000n) /
                      units(position.quantity),
                  ),
                )
              : "—"}
          </dd>
        </div>
      </dl>
      {position.grailHolding ? (
        <p>
          {Number(position.grailHolding.quantity).toLocaleString("en-US", {
            maximumFractionDigits: 2,
          })}{" "}
          {position.grailHolding.symbol} received
        </p>
      ) : position.reward ? (
        <PositionRewards position={position} />
      ) : null}
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
    { connectWallet } = useConnectWallet(),
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
        Card received. <Link href="/portfolio">View portfolio</Link>
      </p>
    );
  return (
    <div className="demo-mint-actions">
      {units(view.topUp ?? "0") > 0n &&
        ["reserved", "prepared"].includes(view.state) && (
          <p role="status">
            This selection needs a marketplace purchase from your wallet. Remove
            it to choose an in-budget demo reward.
          </p>
        )}
      {!wallet && (
        <Button
          variant="outline"
          onClick={() => connectWallet({ walletChainType: "solana-only" })}
        >
          Connect destination wallet
        </Button>
      )}
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
          disabled={a.busy || !wallet || units(view.topUp ?? "0") > 0n}
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
          {units(view.topUp ?? "0") > 0n
            ? "Purchase unavailable"
            : "Mint to wallet"}
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

export function PositionHoldings({
  symbol,
  side,
  replay,
  rehearsal,
  children,
}: {
  symbol?: string;
  side: "yes" | "no";
  replay: boolean;
  rehearsal?: "grail";
  children: (quantity: string) => ReactNode;
}) {
  const { network } = useNetwork();
  const account = usePrivateRead<DemoAccountView>(
    "/api/demo",
    network === "devnet",
  );
  const held =
    network === "devnet"
      ? (account.data?.positions
          .filter(
            (p) =>
              p.symbol === symbol &&
              p.side === side &&
              p.state === "open" &&
              p.replay === replay &&
              p.rehearsal === rehearsal,
          )
          .reduce((sum, p) => sum + units(p.quantity), 0n) ?? 0n)
      : 0n;
  return children(money(held));
}
