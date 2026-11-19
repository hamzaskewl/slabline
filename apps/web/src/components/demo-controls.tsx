"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import {
  useWallets,
  useSignTransaction,
  useSignMessage,
} from "@privy-io/react-auth/solana";
import { useQueryClient } from "@tanstack/react-query";
import type { DemoAccountView, DemoCollectible } from "@collectible/domain";
import { usePrivateRead } from "@/lib/use-private-read";
import { usd } from "@/lib/utils";
import { useNetwork } from "./network-settings";
import { Button } from "./ui/button";

function useDemoAction() {
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
  }, [symbol, side, stake, a.user?.id, a.network]);
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
            className="ticket-action"
            disabled={!shares || Number(shares) <= 0 || a.busy}
            onClick={() => setReview(true)}
          >
            Review prediction
          </Button>
          {review && (
            <div className="review-box">
              <strong>
                {side.toUpperCase()} · {Number(shares).toLocaleString()}{" "}
                estimated shares
              </strong>
              <p>
                Up to {usd(stake)} from your balance.{" "}
                {replay
                  ? "Recorded book · Replay"
                  : "Current book · before fees"}
              </p>
              <Button
                disabled={a.busy}
                onClick={() =>
                  void a.run(async () => {
                    const result = await a.request<DemoAccountView>({
                      action: "buy",
                      key: key.current,
                      eventTicker,
                      symbol,
                      side,
                      stake,
                      replay,
                    });
                    const position = result.positions[0];
                    setReceipt(
                      position
                        ? `${Number(position.quantity).toLocaleString()} shares added · ${usd(position.cost)}`
                        : "Prediction saved",
                    );
                    setReview(false);
                    key.current = crypto.randomUUID();
                  })
                }
              >
                {a.busy ? "Saving…" : "Confirm prediction"}
              </Button>
            </div>
          )}
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
  const a = useDemoAction();
  const snapshot = usePrivateRead<DemoAccountView>(
    "/api/demo",
    a.network === "devnet",
  );
  const [results, setResults] = useState<Record<string, string>>({});
  const key = useRef(crypto.randomUUID());
  if (a.network !== "devnet") return null;
  if (!a.authenticated)
    return (
      <section className="panel funding-panel">
        <h2>{collection ? "Your collectibles" : "Your balance"}</h2>
        <Button onClick={a.login}>Log in</Button>
      </section>
    );
  const data = snapshot.data;
  return (
    <section className="panel funding-panel demo-portfolio">
      {!collection && (
        <div className="demo-balance">
          <div>
            <h2>Available balance</h2>
            <strong>{data ? usd(data.balance) : "—"}</strong>
            <span>Demo USD</span>
          </div>
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
        </div>
      )}
      {(a.error || snapshot.error) && (
        <p role="alert">
          {a.error || snapshot.error?.message}{" "}
          <button
            className="text-button"
            onClick={() => void snapshot.refetch()}
          >
            Retry
          </button>
        </p>
      )}
      {snapshot.isPending && <p role="status">Loading account…</p>}
      {!compact && !collection && (
        <>
          <div className="section-heading">
            <h2>Your positions</h2>
            <button
              className="text-button"
              disabled={a.busy}
              onClick={() =>
                void a.run(async () => {
                  await a.request({ action: "refresh" });
                })
              }
            >
              Check results
            </button>
          </div>
          {!data?.positions.length && !snapshot.isPending && (
            <p>
              No positions yet. <Link href="/demo">Open a replay</Link> or
              choose a market.
            </p>
          )}
          {data?.positions.map((p) => (
            <article className="demo-position" key={p.id}>
              <div>
                <Link
                  href={`/markets/${p.eventTicker}?contract=${p.symbol}&side=${p.side}`}
                >
                  {p.eventTitle}
                </Link>
                <h3>
                  {p.label} · {p.side.toUpperCase()}
                </h3>
                <p>
                  {Number(p.quantity).toLocaleString()} shares · {usd(p.cost)}{" "}
                  paid {p.replay && "· Replay"}
                </p>
              </div>
              <div>
                <strong>
                  {p.state === "open"
                    ? "Open"
                    : `${p.state === "refunded" ? "Refunded" : p.state === "won" ? "Won" : "Lost"} · ${usd(p.payout ?? "0")}`}
                </strong>
                {p.replay && p.state === "open" && (
                  <div className="replay-controls">
                    <label>
                      Result
                      <select
                        aria-label={`Replay result for ${p.label}`}
                        value={results[p.id] ?? "yes"}
                        onChange={(e) =>
                          setResults({ ...results, [p.id]: e.target.value })
                        }
                      >
                        <option value="yes">YES</option>
                        <option value="no">NO</option>
                        <option value="void">Void</option>
                      </select>
                    </label>
                    <Button
                      size="sm"
                      disabled={a.busy}
                      onClick={() =>
                        void a.run(async () => {
                          await a.request({
                            action: "replay",
                            id: p.id,
                            result: results[p.id] ?? "yes",
                          });
                        })
                      }
                    >
                      Finish replay
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </>
      )}
      {!compact && (
        <>
          <h2>{collection ? "Your collectibles" : "Collected cards"}</h2>
          {!data?.collectibles.length && !snapshot.isPending && (
            <p>
              Choose a card from <Link href="/rewards">Rewards</Link>.
            </p>
          )}
          <div className="demo-collection-grid">
            {data?.collectibles.map((c) => (
              <article key={c.id} className="demo-collected">
                {c.image && (
                  <img
                    src={c.image}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div>
                  <h3>{c.name}</h3>
                  <p>
                    {usd(c.cost)} ·{" "}
                    {c.source === "grail" ? "Grail" : "Collector Crypt"}
                  </p>
                  <p>{c.state === "confirmed" ? "Received" : c.state}</p>
                  {c.mint && (
                    <a
                      href={`https://explorer.solana.com/address/${c.mint}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View asset ↗
                    </a>
                  )}
                  {!["confirmed", "cancelled"].includes(c.state) && (
                    <DemoMintActions item={c} />
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function DemoMintActions({
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
    return <p role="status">Reservation refunded.</p>;
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
          Cancel & refund
        </button>
      )}
      {!wallet && <Link href="/wallet">Connect destination wallet</Link>}
      {a.error && <p role="alert">{a.error}</p>}
    </div>
  );
}

export function DemoClaim({
  source,
  sourceId,
  reserveId,
  name,
}: {
  source: "collectorcrypt" | "grail";
  sourceId: string;
  reserveId?: string;
  name: string;
}) {
  const a = useDemoAction(),
    { wallets } = useWallets(),
    { signMessage } = useSignMessage();
  const [selected, setSelected] = useState(""),
    [item, setItem] = useState<DemoCollectible | null>(null),
    [verified, setVerified] = useState("");
  const key = useRef(crypto.randomUUID());
  const links = usePrivateRead<{ wallets: { address: string }[] }>(
    "/api/wallet/links",
    a.network === "devnet",
  );
  const wallet = wallets.find(
    (w) => w.address === (selected || wallets[0]?.address),
  );
  useEffect(() => {
    setItem(null);
    setVerified("");
    key.current = crypto.randomUUID();
  }, [sourceId, reserveId, a.user?.id, a.network, wallet?.address]);
  if (a.network !== "devnet") return null;
  return (
    <div className="demo-claim">
      {!a.authenticated ? (
        <Button onClick={a.login}>Log in to collect</Button>
      ) : !wallet ? (
        <Link href="/wallet">Connect a wallet to collect</Link>
      ) : (
        <>
          <label>
            Destination wallet
            <select
              aria-label={`Wallet for ${name}`}
              value={wallet.address}
              onChange={(e) => setSelected(e.target.value)}
            >
              {wallets.map((w) => (
                <option key={w.address} value={w.address}>
                  {w.address.slice(0, 6)}…{w.address.slice(-4)}
                </option>
              ))}
            </select>
          </label>
          {verified !== wallet.address &&
          !links.data?.wallets.some((w) => w.address === wallet.address) ? (
            <Button
              size="sm"
              disabled={a.busy}
              onClick={() =>
                void a.run(async () => {
                  const proof = await a.request<{
                    nonce: string;
                    message: string;
                  }>({ address: wallet.address }, "/api/wallet/challenge");
                  const signed = await signMessage({
                    message: new TextEncoder().encode(proof.message),
                    wallet,
                  });
                  await a.request(
                    {
                      nonce: proof.nonce,
                      signature: btoa(String.fromCharCode(...signed.signature)),
                    },
                    "/api/wallet/verify",
                  );
                  setVerified(wallet.address);
                })
              }
            >
              Verify wallet
            </Button>
          ) : (
            <Button
              disabled={a.busy || !!item}
              onClick={() =>
                void a.run(async () => {
                  setItem(
                    await a.request<DemoCollectible>({
                      action: "collect",
                      key: key.current,
                      source,
                      sourceId,
                      reserveId,
                      wallet: wallet.address,
                    }),
                  );
                })
              }
            >
              {a.busy
                ? "Preparing…"
                : item
                  ? "Card reserved"
                  : "Collect this card"}
            </Button>
          )}
          {item && (
            <DemoMintActions
              item={item}
              onCancel={() => {
                setItem(null);
                key.current = crypto.randomUUID();
              }}
            />
          )}
        </>
      )}
      {a.error && (
        <p role="alert">
          {a.error} <Link href="/collection">View saved cards</Link>
        </p>
      )}
    </div>
  );
}
