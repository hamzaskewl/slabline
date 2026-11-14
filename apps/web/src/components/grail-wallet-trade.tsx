"use client";
import { useEffect, useRef, useState } from "react";
import {
  usePrivy,
  useWallets,
  useConnectWallet,
  useCreateWallet,
} from "@privy-io/react-auth";
import { createWalletClient, custom, formatUnits } from "viem";
import {
  evmChains,
  type EvmChainId,
  type GrailOrderView,
} from "@collectible/domain";
import { Button } from "./ui/button";
import { TradeQuote, type TradeProps } from "./grail-trading";

// Retain only public transaction hashes, including when browser storage is blocked.
const pendingApprovals = new Map<string, string>();
function pendingApproval(id: string, hash?: string | null) {
  const key = `cm-evm-transaction:${id}`;
  if (hash !== undefined) {
    if (hash) pendingApprovals.set(id, hash);
    else pendingApprovals.delete(id);
    try {
      if (hash) localStorage.setItem(key, hash);
      else localStorage.removeItem(key);
    } catch {}
  }
  try {
    return pendingApprovals.get(id) ?? localStorage.getItem(key);
  } catch {
    return pendingApprovals.get(id);
  }
}

type Balances = {
  payment: string;
  token: string;
  decimals: number;
  native: string;
  paymentDecimals: number;
  paymentSymbol: string;
};
export default function WalletTrade({ token, market, blocker }: TradeProps) {
  const { authenticated, login, getAccessToken } = usePrivy(),
    { wallets } = useWallets(),
    { connectWallet } = useConnectWallet(),
    { createWallet } = useCreateWallet();
  const [selected, setSelected] = useState(""),
    [amount, setAmount] = useState(
      market?.paymentSymbol === "USDC" ? "10" : "0.001",
    ),
    [slippage, setSlippage] = useState("50"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [order, setOrder] = useState<GrailOrderView | null>(null),
    [balances, setBalances] = useState<Balances | null>(null),
    [verified, setVerified] = useState(""),
    [recoveryHash, setRecoveryHash] = useState(""),
    [testNetwork, setTestNetwork] = useState("84532"),
    [testResult, setTestResult] = useState(""),
    [history, setHistory] = useState<GrailOrderView[]>([]);
  const quoteKey = useRef(crypto.randomUUID()),
    generation = useRef(0),
    lock = useRef(false),
    polling = useRef(false),
    wallet = wallets.find(
      (w) =>
        w.address.toLowerCase() ===
        (selected || wallets[0]?.address || "").toLowerCase(),
    );
  const chainId = token.chainId as EvmChainId,
    chain = evmChains[chainId],
    address = wallet?.address.toLowerCase() ?? "";
  useEffect(() => {
    generation.current++;
    setOrder(null);
    setBalances(null);
    setVerified("");
    setHistory([]);
    setRecoveryHash("");
    setTestResult("");

    quoteKey.current = crypto.randomUUID();
  }, [address, authenticated, token.address]);
  async function api<T>(body: object, path = "/api/grail/trade"): Promise<T> {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("Sign in first.");
    const r = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? "Request failed. Retry shortly.");
    return d;
  }
  const selection = {
    chainId,
    wallet: address,
    buyToken: token.address.toLowerCase(),
  };
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function verify() {
    if (!wallet) throw new Error("Connect an EVM wallet first.");
    if (verified === address) return;
    const version = generation.current;
    const proof = await api<{ nonce: string; message: string }>(
      { action: "challenge", address, chainId },
      "/api/evm/wallet",
    );
    const provider = await wallet.getEthereumProvider();
    const client = createWalletClient({ transport: custom(provider) });
    const signature = await client.signMessage({
      account: address as `0x${string}`,
      message: proof.message,
    });
    await api(
      { action: "verify", chainId, nonce: proof.nonce, signature },
      "/api/evm/wallet",
    );
    if (version !== generation.current)
      throw new Error("Wallet changed. Try again.");
    setVerified(address);
  }
  async function refresh() {
    await verify();
    const version = generation.current;
    const [balance, recent] = await Promise.all([
      api<Balances>({ action: "balances", ...selection }),
      api<{ orders: GrailOrderView[] }>({ action: "resume", ...selection }),
    ]);
    if (version !== generation.current) return;
    setBalances(balance);
    setHistory(recent.orders);
    const unsettled = recent.orders.find(
      (o) =>
        [
          "pending",
          "awaiting_signature",
          "reconciliation_required",
          "prepared",
        ].includes(o.state) || pendingApproval(o.id),
    );
    if (unsettled)
      setOrder(
        pendingApproval(unsettled.id)
          ? { ...unsettled, state: "awaiting_signature" }
          : unsettled,
      );
  }
  async function quote() {
    if (order) {
      quoteKey.current = crypto.randomUUID();
      setOrder(null);
    }
    await verify();
    const version = generation.current;
    const next = await api<GrailOrderView>({
      action: "quote",
      ...selection,
      amount,
      slippageBps: Number(slippage),
      idempotencyKey: quoteKey.current,
    });
    if (version !== generation.current) return;
    setOrder(next);
  }
  async function prepare() {
    if (!order) return;
    setOrder(await api<GrailOrderView>({ action: "prepare", id: order.id }));
  }
  async function signAndSubmit() {
    if (!wallet || !order?.prepared || !order.canSubmit)
      throw new Error("Review the transaction first.");
    const current = order,
      version = generation.current;
    await wallet.switchChain(chainId);
    const provider = await wallet.getEthereumProvider();
    const accounts = (await provider.request({
      method: "eth_accounts",
    })) as string[];
    if (
      !accounts.some((a) => a.toLowerCase() === current.quote.wallet) ||
      Number(await provider.request({ method: "eth_chainId" })) !== chainId ||
      version !== generation.current
    )
      throw new Error("Wallet changed. Refresh the quote.");
    const claimed = await api<GrailOrderView>({
      action: "signing",
      id: current.id,
    });
    setOrder(claimed);
    let hash: string;
    try {
      hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [claimed.prepared!.transaction],
      })) as string;
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === 4001)
        setOrder(
          await api<GrailOrderView>({ action: "rejected", id: current.id }),
        );
      else
        throw new Error(
          "Wallet result unknown. Check your wallet and enter its transaction hash below. Do not send again.",
        );
      return;
    }
    pendingApproval(current.id, hash);
    const updated = await api<GrailOrderView>({
      action: "broadcasted",
      id: current.id,
      hash,
    });
    pendingApproval(current.id, null);
    if (version === generation.current) setOrder(updated);
  }
  async function status() {
    if (!order) return;
    const version = generation.current;
    const pendingHash = !order.transactionHash
      ? pendingApproval(order.id) || recoveryHash
      : null;
    const updated = await api<GrailOrderView>(
      pendingHash
        ? { action: "broadcasted", id: order.id, hash: pendingHash }
        : { action: "status", id: order.id },
    );
    if (pendingHash && updated.state !== "quoted")
      pendingApproval(order.id, null);
    if (version === generation.current) setOrder(updated);
  }
  const visibleBlocker = order ? order.blocker : blocker;
  const pending =
    !!order &&
    ["pending", "awaiting_signature", "reconciliation_required"].includes(
      order.state,
    );
  useEffect(() => {
    if (!pending) return;
    let attempts = 0;
    const timer = setInterval(() => {
      if (++attempts > 40) {
        clearInterval(timer);
        return;
      }
      if (polling.current) return;
      polling.current = true;
      void status()
        .catch(() => {})
        .finally(() => {
          polling.current = false;
        });
    }, 3000);
    return () => clearInterval(timer);
  }, [order?.id, order?.state, order?.transactionHash, pending, address]);
  useEffect(() => {
    if (!authenticated || !address) return;
    let active = true;
    void api<{ orders: GrailOrderView[] }>({ action: "resume", ...selection })
      .then((r) => {
        if (!active) return;
        setHistory(r.orders);
        const unresolved = r.orders.find((o) =>
          [
            "prepared",
            "awaiting_signature",
            "pending",
            "reconciliation_required",
          ].includes(o.state),
        );
        if (unresolved) setOrder(unresolved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [authenticated, address, chainId, token.address]);
  function change() {
    setOrder(null);
    setRecoveryHash("");
    quoteKey.current = crypto.randomUUID();
  }
  if (!authenticated)
    return (
      <>
        <p>Connect your own EVM wallet to buy this token.</p>
        <Button onClick={login}>Log in / Sign up</Button>
      </>
    );
  return (
    <>
      <label className="token-amount-label">
        Your EVM wallet
        <select
          value={address}
          disabled={busy || pending}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="" disabled>
            Select wallet
          </option>
          {wallets.map((w) => (
            <option value={w.address.toLowerCase()} key={w.address}>
              {w.address.slice(0, 8)}…{w.address.slice(-6)} ·{" "}
              {w.walletClientType}
            </option>
          ))}
        </select>
      </label>
      <div className="wallet-actions">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || pending}
          onClick={() => connectWallet({ walletChainType: "ethereum-only" })}
        >
          Connect wallet
        </Button>
        {!wallets.some((w) => w.walletClientType === "privy") && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || pending}
            onClick={() =>
              void run(async () => {
                const w = await createWallet();
                setSelected(w.address.toLowerCase());
              })
            }
          >
            Create EVM wallet
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={!wallet || busy}
          onClick={() => void run(refresh)}
        >
          Verify &amp; refresh balances
        </Button>
      </div>
      {balances && (
        <p className="token-balances">
          {formatUnits(BigInt(balances.payment), balances.paymentDecimals)}{" "}
          {balances.paymentSymbol} · {formatUnits(BigInt(balances.native), 18)}{" "}
          ETH · {formatUnits(BigInt(balances.token), balances.decimals)}{" "}
          {token.symbol}
        </p>
      )}
      <label className="token-amount-label">
        Spend · {chain.paymentSymbol}
        <input
          inputMode="decimal"
          value={amount}
          disabled={busy || pending}
          onChange={(e) => {
            setAmount(e.target.value);
            change();
          }}
        />
      </label>
      <label className="token-amount-label">
        Slippage limit
        <select
          value={slippage}
          disabled={busy || pending}
          onChange={(e) => {
            setSlippage(e.target.value);
            change();
          }}
        >
          <option value="30">0.3%</option>
          <option value="50">0.5%</option>
          <option value="100">1%</option>
        </select>
      </label>
      {!pending && (
        <Button
          disabled={!wallet || busy || !market}
          onClick={() => void run(quote)}
        >
          {busy ? "Working…" : order ? "Refresh quote" : "Review quote"}
        </Button>
      )}
      {!market && (
        <p role="status">
          Pool details could not be loaded. Reload this page to retry.
        </p>
      )}
      {order && (
        <>
          <TradeQuote order={order} />
          {order.state === "quoted" && (
            <Button
              disabled={busy || !order.canSubmit}
              onClick={() => void run(prepare)}
            >
              Review{" "}
              {order.quote.nextAction === "swap" ? "purchase" : "approval"}
            </Button>
          )}
          {order.state === "prepared" && order.prepared && (
            <>
              <p>
                {order.prepared.action === "swap"
                  ? `Buy ${token.symbol}`
                  : `Approve exactly ${formatUnits(BigInt(order.quote.sellAmount), order.quote.paymentDecimals)} ${order.quote.paymentSymbol}`}
                . Estimated gas:{" "}
                {formatUnits(BigInt(order.prepared.estimatedGasWei), 18)} ETH.
                Your wallet shows the final fee.
              </p>
              <Button
                disabled={busy || !order.canSubmit}
                onClick={() => void run(signAndSubmit)}
              >
                Sign{" "}
                {order.prepared.action === "swap" ? "purchase" : "approval"}
              </Button>
            </>
          )}
          {pending && (
            <>
              <p role="status">
                {order.transactionHash
                  ? "Waiting for onchain confirmation"
                  : "Waiting for the wallet result"}
              </p>
              {!order.transactionHash && (
                <label className="token-amount-label">
                  Transaction hash from your wallet
                  <input
                    value={recoveryHash}
                    onChange={(e) => setRecoveryHash(e.target.value)}
                    placeholder="0x�"
                  />
                </label>
              )}
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => void run(status)}
              >
                Check status
              </Button>
            </>
          )}
          {order.state === "approval_confirmed" && (
            <p role="status">
              Approval confirmed. Refresh the quote to review your purchase.
            </p>
          )}
          {order.state === "confirmed" && (
            <p role="status">
              Received{" "}
              {formatUnits(BigInt(order.received ?? "0"), order.quote.decimals)}{" "}
              {token.symbol} in {order.quote.wallet}.
            </p>
          )}
          {order.state === "failed" && (
            <p role="alert">
              Transaction failed. Refresh balances before trying again.
            </p>
          )}
          {order.transactionHash && (
            <a
              href={`${chain.explorer}/tx/${order.transactionHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction ↗
            </a>
          )}
        </>
      )}
      {visibleBlocker && <p className="token-blocker">{visibleBlocker}</p>}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <details className="token-history">
        <summary>Test wallet connection</summary>
        <label className="token-amount-label">
          Test network
          <select
            value={testNetwork}
            disabled={busy || pending}
            onChange={(e) => {
              setTestNetwork(e.target.value);
              setTestResult("");
            }}
          >
            <option value="84532">Base Sepolia</option>
            <option value="46630">Robinhood Testnet</option>
          </select>
        </label>
        <Button
          variant="outline"
          disabled={!wallet || busy || pending}
          onClick={() =>
            void run(async () => {
              if (!wallet) return;
              const version = generation.current;
              await wallet.switchChain(Number(testNetwork));
              const provider = await wallet.getEthereumProvider();
              if (
                Number(await provider.request({ method: "eth_chainId" })) !==
                Number(testNetwork)
              )
                throw new Error("Wallet did not switch to the test network.");
              const balance = (await provider.request({
                method: "eth_getBalance",
                params: [wallet.address, "latest"],
              })) as string;
              if (version === generation.current)
                setTestResult(
                  `Connected. ${formatUnits(BigInt(balance), 18)} test ETH. No transaction sent.`,
                );
            })
          }
        >
          Check testnet wallet
        </Button>
        <p role="status">
          {testResult ||
            "Checks your wallet and test ETH balance. Grail’s live tokens are not deployed on these test networks."}
        </p>
      </details>
      {history.length > 0 && (
        <details className="token-history">
          <summary>Recent orders</summary>
          {history.map((o) => (
            <button
              key={o.id}
              disabled={busy || pending}
              onClick={() => {
                setOrder(o);
                setAmount(
                  formatUnits(
                    BigInt(o.quote.sellAmount),
                    o.quote.paymentDecimals,
                  ),
                );
              }}
            >
              {new Date(o.quote.expiresAt).toLocaleString()} ·{" "}
              {o.state.replaceAll("_", " ")}
            </button>
          ))}
        </details>
      )}
    </>
  );
}
