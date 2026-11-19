"use client";
import { Select } from "./ui/select";
import { useEffect, useRef, useState } from "react";
import { usePrivy, useWallets, useConnectWallet } from "@privy-io/react-auth";
import { useWallets as useSolanaWallets } from "@privy-io/react-auth/solana";
import { createWalletClient, custom } from "viem";
import { ArrowRight } from "lucide-react";
import {
  relayRoutes,
  type RelayRouteId,
  type RelayRecord,
} from "@collectible/domain";
import { Button } from "./ui/button";
import { RelayQuoteReview } from "./relay-quote-review";

type LinkedWallet = { address: string; network: string };
type Capabilities = {
  capabilities: {
    environment: string;
    routes: { id: string; available: boolean; keyConfigured: boolean }[];
    error: string | null;
  }[];
};
const short = (s: string) => `${s.slice(0, 7)}…${s.slice(-5)}`;
export default function RelayFunding() {
  const { authenticated, login, getAccessToken, user } = usePrivy(),
    { wallets } = useWallets(),
    { wallets: solanaWallets } = useSolanaWallets(),
    { connectWallet } = useConnectWallet();
  const [routeId, setRouteId] = useState<RelayRouteId>("sepolia-base-sepolia"),
    [selected, setSelected] = useState(""),
    [solana, setSolana] = useState(""),
    [amount, setAmount] = useState("0.01"),
    [links, setLinks] = useState<LinkedWallet[]>([]),
    [preview, setPreview] = useState<{
      key: string;
      record: RelayRecord;
    } | null>(null),
    [history, setHistory] = useState<RelayRecord[]>([]),
    [capabilities, setCapabilities] = useState<Capabilities | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(0);
  const generation = useRef(0),
    lock = useRef(false),
    requestKey = useRef(crypto.randomUUID());
  const route = relayRoutes[routeId],
    wallet = wallets.find(
      (w) =>
        w.address.toLowerCase() ===
        (selected || wallets[0]?.address || "").toLowerCase(),
    ),
    source = wallet?.address.toLowerCase() ?? "",
    recipient =
      route.destinationNetwork === "solana"
        ? solana || solanaWallets[0]?.address || ""
        : source;
  const inputKey = JSON.stringify([
      user?.id,
      routeId,
      source,
      recipient,
      amount,
    ]),
    view = authenticated && preview?.key === inputKey ? preview.record : null;
  const verifiedSource = links.some(
      (w) => w.network === "eip155" && w.address.toLowerCase() === source,
    ),
    verifiedDestination =
      route.destinationNetwork !== "solana" ||
      links.some(
        (w) =>
          w.address === recipient && ["devnet", "mainnet"].includes(w.network),
      );
  const availability = capabilities?.capabilities
    .flatMap((c) => c.routes)
    .find((r) => r.id === routeId);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/relay", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<Capabilities>;
      })
      .then(setCapabilities)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    generation.current++;
    requestKey.current = crypto.randomUUID();
    setError("");
  }, [inputKey]);
  useEffect(() => {
    setLinks([]);
    setHistory([]);
    if (!authenticated) return;
    let active = true;
    void Promise.all([
      api<{ wallets: LinkedWallet[] }>({ action: "wallets" }),
      api<{ quotes: RelayRecord[] }>({ action: "resume" }),
    ])
      .then(([w, h]) => {
        if (active) {
          setLinks(w.wallets);
          setHistory(h.quotes);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Saved quotes unavailable.",
          );
      });
    return () => {
      active = false;
    };
    // Only reload account-owned data when identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, user?.id]);
  useEffect(() => {
    if (!view?.quote) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [view?.quote]);
  async function api<T>(body: object, path = "/api/relay"): Promise<T> {
    const token = await getAccessToken();
    if (!token) throw new Error("Sign in to continue.");
    const r = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Request failed. Try again.");
    return data as T;
  }
  async function run(action: (version: number) => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const version = generation.current;
    try {
      await action(version);
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : "Quote unavailable.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function verify(version: number) {
    if (!wallet) throw new Error("Connect an EVM wallet first.");
    const proof = await api<{ nonce: string; message: string }>(
      { action: "challenge", address: source, chainId: 8453 },
      "/api/evm/wallet",
    );
    const provider = await wallet.getEthereumProvider();
    if (version !== generation.current) return;
    const signature = await createWalletClient({
      transport: custom(provider),
    }).signMessage({
      account: source as `0x${string}`,
      message: proof.message,
    });
    if (version !== generation.current) return;
    await api(
      { action: "verify", chainId: 8453, nonce: proof.nonce, signature },
      "/api/evm/wallet",
    );
    if (version !== generation.current) return;
    const result = await api<{ wallets: LinkedWallet[] }>({
      action: "wallets",
    });
    if (version === generation.current) setLinks(result.wallets);
  }
  async function quote(version: number) {
    const key = inputKey;
    const next = await api<RelayRecord>({
      action: "quote",
      routeId,
      wallet: source,
      recipient,
      amount,
      idempotencyKey: requestKey.current,
    });
    if (version !== generation.current) return;
    setPreview({ key, record: next });
    setNow(Date.now());
    if (next.state !== "quoting") requestKey.current = crypto.randomUUID();
    setHistory((previous) =>
      [next, ...previous.filter((r) => r.id !== next.id)].slice(0, 10),
    );
  }
  return (
    <section
      className="panel funding-panel relay-panel"
      aria-labelledby="relay-heading"
    >
      <div className="relay-heading">
        <h2 id="relay-heading">Bridge quote</h2>
        <span className="mode-badge">
          {route.environment === "testnet" ? "Test quote" : "Quotes only"}
        </span>
      </div>
      <div className="relay-form">
        <label>
          Route
          <Select
            value={routeId}
            disabled={busy}
            onChange={(e) => {
              const id = e.target.value as RelayRouteId;
              setRouteId(id);
              setAmount(
                relayRoutes[id].environment === "testnet" ? "0.01" : "100",
              );
            }}
          >
            <optgroup label="Testnet">
              <option value="base-sepolia-sepolia">
                Base Sepolia → Sepolia · test ETH
              </option>
              <option value="sepolia-base-sepolia">
                Sepolia → Base Sepolia · test ETH
              </option>
            </optgroup>
            <optgroup label="Mainnet · read-only">
              <option value="ethereum-solana">
                Ethereum USDC → Solana USDC
              </option>
              <option value="base-solana">Base USDC → Solana USDC</option>
            </optgroup>
          </Select>
        </label>
        <label>
          Amount · {route.symbol}
          <input
            value={amount}
            inputMode="decimal"
            autoComplete="off"
            disabled={busy}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {authenticated && (
          <>
            <label>
              Source wallet
              <Select
                value={source}
                disabled={busy || !wallets.length}
                onChange={(e) => setSelected(e.target.value)}
              >
                {!wallets.length && (
                  <option value="">Connect an EVM wallet</option>
                )}
                {wallets.map((w) => (
                  <option key={w.address} value={w.address.toLowerCase()}>
                    {short(w.address)}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Destination
              {route.destinationNetwork === "solana" ? (
                <Select
                  value={recipient}
                  disabled={busy || !solanaWallets.length}
                  onChange={(e) => setSolana(e.target.value)}
                >
                  {!solanaWallets.length && (
                    <option value="">Connect a Solana wallet above</option>
                  )}
                  {solanaWallets.map((w) => (
                    <option key={w.address} value={w.address}>
                      {short(w.address)} · Solana mainnet
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="relay-destination">
                  Same wallet on {route.destinationName}
                </div>
              )}
            </label>
          </>
        )}
      </div>
      <div className="relay-actions">
        {!authenticated ? (
          <Button onClick={login}>Log in to get a quote</Button>
        ) : (
          <>
            {!wallets.length && (
              <Button
                onClick={() =>
                  connectWallet({ walletChainType: "ethereum-only" })
                }
              >
                Connect EVM wallet
              </Button>
            )}
            {!!wallets.length && !verifiedSource && (
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => void run(verify)}
              >
                {busy ? "Verifying…" : "Verify source wallet"}
              </Button>
            )}
            <Button
              disabled={
                busy ||
                !verifiedSource ||
                !verifiedDestination ||
                availability?.available === false ||
                availability?.keyConfigured === false
              }
              onClick={() => void run(quote)}
            >
              {busy ? "Requesting…" : view ? "Refresh quote" : "Get quote"}
              <ArrowRight size={16} />
            </Button>
            <Button disabled variant="outline">
              Transfer disabled
            </Button>
          </>
        )}
      </div>
      {authenticated && !verifiedDestination && (
        <p role="status">
          Verify the selected Solana wallet in the wallet section above.
        </p>
      )}
      {availability?.available === false && (
        <p role="status">
          Relay is not offering this route right now. Try another route.
        </p>
      )}
      {availability?.keyConfigured === false && (
        <p role="status">Quotes are temporarily unavailable.</p>
      )}
      {error && (
        <p role="alert" className="relay-error">
          {error}
        </p>
      )}
      {view?.error && (
        <p role="alert" className="relay-error">
          {view.error}
        </p>
      )}
      {view?.quote && (
        <RelayQuoteReview
          record={view}
          now={now}
          busy={busy}
          onStatus={() =>
            void run(async (version) => {
              const result = await api<RelayRecord>({
                action: "status",
                id: view.id,
              });
              if (version === generation.current)
                setPreview({ key: inputKey, record: result });
            })
          }
        />
      )}
      {!!history.length && (
        <details className="relay-history">
          <summary>Saved quotes</summary>
          {history.slice(0, 5).map(
            (r) =>
              r.quote && (
                <button
                  type="button"
                  key={r.id}
                  disabled={busy}
                  onClick={() => {
                    const q = r.quote!;
                    setRouteId(q.input.routeId);
                    setSelected(q.input.wallet);
                    if (
                      relayRoutes[q.input.routeId].destinationNetwork ===
                      "solana"
                    )
                      setSolana(q.input.recipient);
                    setAmount(q.input.amount);
                    const key = JSON.stringify([
                      user?.id,
                      q.input.routeId,
                      q.input.wallet,
                      q.input.recipient,
                      q.input.amount,
                    ]);
                    setPreview({ key, record: r });
                    setNow(Date.now());
                  }}
                >
                  {relayRoutes[r.quote.input.routeId].name} ·{" "}
                  {r.quote.input.amount}{" "}
                  {relayRoutes[r.quote.input.routeId].symbol}
                </button>
              ),
          )}
        </details>
      )}
    </section>
  );
}
