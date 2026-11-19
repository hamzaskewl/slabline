"use client";
import { useSlablineAuth } from "./sign-in-dialog";
import { Select } from "./ui/select";
import { useEffect, useRef, useState } from "react";

import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";
import Link from "next/link";
import {
  type Listing,
  type CcTestView,
  relayFormat,
} from "@collectible/domain";
import { Button } from "./ui/button";

export function CollectorCryptTest() {
  const { authenticated, login, getAccessToken, user } = useSlablineAuth(),
    { wallets } = useWallets(),
    { signTransaction } = useSignTransaction();
  const [cards, setCards] = useState<Listing[] | null>(null),
    [mint, setMint] = useState(""),
    [selected, setSelected] = useState(""),
    [preview, setPreview] = useState<{
      owner: string;
      value: CcTestView;
    } | null>(null),
    [history, setHistory] = useState<{
      owner: string;
      tests: CcTestView[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    lock = useRef(false),
    key = useRef(crypto.randomUUID());
  const wallet = wallets.find(
      (w) => w.address === (selected || wallets[0]?.address),
    ),
    card = cards?.find((c) => c.mint === (mint || cards[0]?.mint)),
    view =
      authenticated &&
      preview &&
      preview.owner === user?.id &&
      preview.value.wallet === wallet?.address
        ? preview.value
        : null;
  useEffect(() => {
    generation.current++;
    key.current = crypto.randomUUID();
    setError("");
  }, [user?.id, wallet?.address, card?.mint]);
  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    void api<{ tests: CcTestView[] }>({ action: "resume" })
      .then((v) => {
        if (active) setHistory({ owner: user!.id, tests: v.tests });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [authenticated, user?.id]);
  async function api<T>(body: object): Promise<T> {
    const token = await getAccessToken();
    if (!token) throw new Error("Sign in first.");
    const r = await fetch("/api/collectorcrypt/test", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Card test unavailable.");
    return data;
  }
  async function run(task: (version: number) => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const version = generation.current;
    try {
      await task(version);
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : "Card test unavailable.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function save(value: CcTestView, version: number) {
    if (version !== generation.current || !user) return;
    setPreview({ owner: user.id, value });
    setHistory((prior) => ({
      owner: user.id,
      tests: [
        value,
        ...(prior?.owner === user.id ? prior.tests : []).filter(
          (r) => r.id !== value.id,
        ),
      ].slice(0, 10),
    }));
  }
  async function load() {
    const r = await fetch("/api/collectorcrypt/test", {
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Devnet catalog unavailable.");
    setCards(data.cards);
  }
  async function sign(version: number) {
    if (!view || !wallet || !view.canSign) return;
    const id = view.id;
    let submitAttempted = false;
    try {
      const claimed = await api<CcTestView>({ action: "signing", id });
      save(claimed, version);
      if (version !== generation.current || !claimed.unsignedBase64) {
        await api({ action: "cancel", id });
        throw new Error("Wallet or review changed. Prepare a new test.");
      }
      const signed = await signTransaction({
        transaction: Uint8Array.from(atob(claimed.unsignedBase64), (c) =>
          c.charCodeAt(0),
        ),
        wallet,
        chain: "solana:devnet",
      });
      if (version !== generation.current) {
        await api({ action: "cancel", id });
        return;
      }
      submitAttempted = true;
      save(
        await api<CcTestView>({
          action: "submit",
          id,
          signedBase64: btoa(String.fromCharCode(...signed.signedTransaction)),
        }),
        version,
      );
    } catch (e) {
      if (!submitAttempted)
        await api<CcTestView>({ action: "cancel", id })
          .then((v) => save(v, version))
          .catch(() => {});
      if (submitAttempted)
        throw new Error(
          "Submission outcome needs checking. Open the saved test and check its signature before trying another card.",
        );
      throw e;
    }
  }
  return (
    <section
      className="panel funding-panel cc-test-panel"
      aria-labelledby="cc-test-heading"
    >
      <div className="relay-heading">
        <h2 id="cc-test-heading">Collector Crypt devnet test</h2>
        <span className="mode-badge">DEVNET</span>
      </div>
      <p>
        Test cards and test USDC only. These assets do not redeem for physical
        cards. Gas sponsorship is off.
      </p>
      {!cards ? (
        <Button disabled={busy} onClick={() => void run(async () => load())}>
          Load test listings
        </Button>
      ) : cards.length === 0 ? (
        <p>No supported test listings are available.</p>
      ) : (
        <>
          <div className="relay-form">
            <label>
              Test card
              <Select
                value={card?.mint ?? ""}
                disabled={busy}
                onChange={(e) => setMint(e.target.value)}
              >
                {cards.map((c) => (
                  <option key={c.mint} value={c.mint}>
                    {c.name} · {c.ask} test USDC
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Devnet wallet
              <Select
                value={wallet?.address ?? ""}
                disabled={busy || !wallets.length}
                onChange={(e) => setSelected(e.target.value)}
              >
                {!wallets.length && (
                  <option value="">Connect a wallet on Wallet</option>
                )}
                {wallets.map((w) => (
                  <option key={w.address} value={w.address}>
                    {w.address.slice(0, 7)}…{w.address.slice(-5)}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          {card && (
            <div className="cc-test-card">
              {card.frontImage && (
                <img src={card.frontImage} alt={card.name} loading="lazy" />
              )}
              <div>
                <h3>{card.name}</h3>
                <p>
                  {card.grader} {card.grade} · {card.ask} Collector Crypt test
                  USDC
                </p>
                <Link href="/wallet">Connect and verify wallet</Link>
              </div>
            </div>
          )}
          <div className="relay-actions">
            {!authenticated ? (
              <Button onClick={login}>Log in to inspect a test</Button>
            ) : (
              <Button
                disabled={busy || !wallet || !card}
                onClick={() =>
                  void run(async (version) => {
                    const result = await api<CcTestView>({
                      action: "prepare",
                      wallet: wallet!.address,
                      mint: card!.mint,
                      idempotencyKey: key.current,
                    });
                    save(result, version);
                    key.current = crypto.randomUUID();
                  })
                }
              >
                {busy ? "Checking…" : "Inspect & simulate"}
              </Button>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="relay-error">
          {error}
        </p>
      )}
      {view && (
        <div className="relay-review" aria-live="polite">
          <h3>{view.state.replaceAll("_", " ")}</h3>
          {view.error && <p role="alert">{view.error}</p>}
          {view.simulation && (
            <>
              <p>
                Simulation passed on devnet. No funds moved in the simulation.
              </p>
              <dl>
                <div>
                  <dt>Test USDC payment</dt>
                  <dd>{relayFormat(view.simulation.priceBaseUnits, 6)}</dd>
                </div>
                <div>
                  <dt>Simulated total SOL cost</dt>
                  <dd>
                    {relayFormat(view.simulation.totalSolCostLamports, 9)} SOL
                  </dd>
                </div>
                <div>
                  <dt>Platform fee · included in card price</dt>
                  <dd>
                    {relayFormat(view.simulation.platformFeeBaseUnits, 6)} test
                    USDC
                  </dd>
                </div>
                <div>
                  <dt>Simulation slot</dt>
                  <dd>{view.simulation.slot}</dd>
                </div>
              </dl>
            </>
          )}
          {view.blocker && <p>{view.blocker}</p>}
          <div className="relay-actions">
            <Button
              disabled={busy || !view.canSign}
              onClick={() => void run(sign)}
            >
              {view.canSign ? "Sign & submit devnet test" : "Signing disabled"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async (version) =>
                  save(
                    await api<CcTestView>({ action: "status", id: view.id }),
                    version,
                  ),
                )
              }
            >
              Check receipt
            </Button>
            {view.canRetry && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async (version) =>
                    save(
                      await api<CcTestView>({ action: "retry", id: view.id }),
                      version,
                    ),
                  )
                }
              >
                Retry saved transaction
              </Button>
            )}
            {["building", "prepared", "awaiting_signature"].includes(
              view.state,
            ) && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async (version) =>
                    save(
                      await api<CcTestView>({ action: "cancel", id: view.id }),
                      version,
                    ),
                  )
                }
              >
                Cancel test
              </Button>
            )}
          </div>
          {view.signature && (
            <p className="cc-test-signature">
              Signature:{" "}
              <a
                href={`https://explorer.solana.com/tx/${view.signature}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                {view.signature}
              </a>
            </p>
          )}
          {view.ownership && (
            <p>
              {view.ownership.verified
                ? "Test card ownership verified"
                : "Ownership is not verified"}{" "}
              at slot {view.ownership.slot}.
            </p>
          )}
        </div>
      )}
      {authenticated &&
        history &&
        history.owner === user?.id &&
        !!history.tests.length && (
          <details className="relay-history">
            <summary>Saved card tests</summary>
            {history.tests.map((t) => (
              <button
                type="button"
                disabled={busy}
                key={t.id}
                onClick={() => {
                  if (!wallets.some((w) => w.address === t.wallet)) {
                    setError(
                      "Connect the wallet used for this saved test first.",
                    );
                    return;
                  }
                  setSelected(t.wallet);
                  setPreview({ owner: user!.id, value: t });
                }}
              >
                {t.card?.name ?? t.id.slice(0, 8)} ·{" "}
                {t.state.replaceAll("_", " ")}
              </button>
            ))}
          </details>
        )}
    </section>
  );
}
