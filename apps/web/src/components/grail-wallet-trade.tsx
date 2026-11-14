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
  const key = `cm-evm-approval:${id}`;
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
};
export default function WalletTrade({
  token,
  quoteConfigured,
  blocker,
}: TradeProps) {
  const { authenticated, login, getAccessToken } = usePrivy(),
    { wallets } = useWallets(),
    { connectWallet } = useConnectWallet(),
    { createWallet } = useCreateWallet();
  const [selected, setSelected] = useState(""),
    [amount, setAmount] = useState("10"),
    [slippage, setSlippage] = useState("50"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [order, setOrder] = useState<GrailOrderView | null>(null),
    [balances, setBalances] = useState<Balances | null>(null),
    [verified, setVerified] = useState(""),
    [approvalFee, setApprovalFee] = useState<string | null>(null),
    [history, setHistory] = useState<GrailOrderView[]>([]);
  const quoteKey = useRef(crypto.randomUUID()),
    generation = useRef(0),
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
    setApprovalFee(null);
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
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
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
          "submitting",
          "reconciliation_required",
          "approval_pending",
        ].includes(o.state) || pendingApproval(o.id),
    );
    if (unsettled)
      setOrder(
        pendingApproval(unsettled.id)
          ? { ...unsettled, state: "approval_pending" }
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
    setApprovalFee(null);
  }
  async function signAndSubmit() {
    if (!wallet || !order || !order.canSubmit)
      throw new Error("Purchases are not enabled.");
    const current = order;
    const version = generation.current;
    if (Date.parse(current.quote.expiresAt) <= Date.now())
      throw new Error("Quote expired. Refresh the quote.");
    await wallet.switchChain(chainId);
    const provider = await wallet.getEthereumProvider();
    const accounts = (await provider.request({
      method: "eth_accounts",
    })) as string[];
    if (!accounts.some((a) => a.toLowerCase() === current.quote.wallet))
      throw new Error("Wallet account changed. Refresh the quote.");
    if (Number(await provider.request({ method: "eth_chainId" })) !== chainId)
      throw new Error("Wallet is on the wrong chain.");
    if (version !== generation.current)
      throw new Error("Wallet changed. Refresh the quote.");
    const signature = (await provider.request({
      method: "eth_signTypedData_v4",
      params: [
        current.quote.wallet,
        JSON.stringify(current.quote.trade.eip712),
      ],
    })) as string;
    if (version !== generation.current)
      throw new Error("Wallet changed. Refresh the quote.");
    setOrder({ ...current, state: "submitting" });
    setOrder(
      await api<GrailOrderView>({
        action: "submit",
        id: current.id,
        signature,
      }),
    );
  }
  async function approve() {
    if (!wallet || !order) return;
    if (!approvalFee) {
      const result = await api<{ estimatedGasWei: string }>({
        action: "approval",
        id: order.id,
      });
      setApprovalFee(result.estimatedGasWei);
      return;
    }
    const current = order;
    const version = generation.current;
    const result = await api<{
      transaction: { to: `0x${string}`; data: `0x${string}`; value: string };
    }>({ action: "approval", id: current.id });
    await wallet.switchChain(chainId);
    const provider = await wallet.getEthereumProvider();
    if (Number(await provider.request({ method: "eth_chainId" })) !== chainId)
      throw new Error("Wallet is on the wrong chain.");
    if (version !== generation.current)
      throw new Error("Wallet changed. Refresh the quote.");
    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [{ ...result.transaction, from: current.quote.wallet }],
    })) as string;
    pendingApproval(current.id, hash);
    setOrder({ ...current, state: "approval_pending" });
    setOrder(
      await api<GrailOrderView>({
        action: "approval_sent",
        id: current.id,
        hash,
      }),
    );
    pendingApproval(current.id, null);
  }
  async function status() {
    if (!order) return;
    const version = generation.current;
    const pendingHash = pendingApproval(order.id);
    const updated = await api<GrailOrderView>(
      pendingHash
        ? { action: "approval_sent", id: order.id, hash: pendingHash }
        : { action: "status", id: order.id },
    );
    if (pendingHash && updated.state !== "quoted")
      pendingApproval(order.id, null);
    if (version === generation.current) setOrder(updated);
  }
  const visibleBlocker = order ? order.blocker : blocker;
  const pending =
    !!order &&
    [
      "pending",
      "submitting",
      "reconciliation_required",
      "approval_pending",
    ].includes(order.state);
  useEffect(() => {
    if (!pending) return;
    let attempts = 0;
    const timer = setInterval(() => {
      if (++attempts > 40) {
        clearInterval(timer);
        return;
      }
      void status().catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [order?.id, pending, address]);
  function change() {
    setOrder(null);
    setApprovalFee(null);
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
          {formatUnits(BigInt(balances.payment), 6)} {chain.paymentSymbol} ·{" "}
          {formatUnits(BigInt(balances.native), 18)} ETH ·{" "}
          {formatUnits(BigInt(balances.token), balances.decimals)}{" "}
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
          disabled={!wallet || busy || !quoteConfigured}
          onClick={() => void run(quote)}
        >
          {busy ? "Working…" : order ? "Refresh quote" : "Review quote"}
        </Button>
      )}
      {!quoteConfigured && (
        <p role="status">Live quotes are awaiting provider setup.</p>
      )}
      {order && (
        <>
          <TradeQuote order={order} />
          {order.state === "quoted" && order.quote.approvalRequired && (
            <>
              <p>
                Approve exactly {formatUnits(BigInt(order.quote.sellAmount), 6)}{" "}
                {chain.paymentSymbol} for Permit2, then refresh the quote. This
                separate transaction requires ETH; sponsorship is off.
              </p>
              {approvalFee && (
                <p>
                  Estimated approval gas: {formatUnits(BigInt(approvalFee), 18)}{" "}
                  ETH. Your wallet shows the final fee.
                </p>
              )}
              <Button
                disabled={busy || !order.canSubmit}
                onClick={() => void run(approve)}
              >
                {approvalFee ? "Sign token approval" : "Review token approval"}
              </Button>
            </>
          )}
          {order.state === "quoted" && !order.quote.approvalRequired && (
            <Button
              disabled={busy || !order.canSubmit}
              onClick={() => void run(signAndSubmit)}
            >
              Sign &amp; buy {token.symbol}
            </Button>
          )}
          {pending && (
            <>
              <p role="status">
                {order.state === "approval_pending"
                  ? "Approval pending"
                  : "Purchase pending"}
              </p>
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
      {history.length > 0 && (
        <details className="token-history">
          <summary>Recent orders</summary>
          {history.map((o) => (
            <button
              key={o.id}
              disabled={busy || pending}
              onClick={() => {
                setOrder(o);
                setAmount(formatUnits(BigInt(o.quote.sellAmount), 6));
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
