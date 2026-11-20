"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useConnectWallet } from "@privy-io/react-auth";
import {
  useWallets,
  useSignMessage,
  useSignTransaction,
} from "@privy-io/react-auth/solana";
import {
  units,
  type UsdcTransfer,
  type UsdcTransferAccount,
} from "@collectible/domain";
import { usePrivateRead } from "@/lib/use-private-read";
import { useDemoAction } from "./demo-controls";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { UsdcAmount } from "./usdc-amount";

const path = "/api/demo/usdc";
const active = (t: UsdcTransfer) =>
  t.state === "prepared" || t.state === "submitted";
export function UsdcTransfers({
  direction,
  balance,
}: {
  direction: "deposit" | "withdraw";
  balance?: string;
}) {
  const a = useDemoAction();
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const { signMessage } = useSignMessage();
  const { signTransaction } = useSignTransaction();
  const [selected, setSelected] = useState("");
  const wallet = wallets.find((w) => w.address === selected) ?? wallets[0];
  const links = usePrivateRead<{ wallets: { address: string }[] }>(
    "/api/wallet/links",
  );
  const verified = links.data?.wallets.some(
    (w) => w.address === wallet?.address,
  );
  const snapshot = usePrivateRead<UsdcTransferAccount>(
    `${path}${verified && wallet ? `?wallet=${encodeURIComponent(wallet.address)}` : ""}`,
  );
  const [amount, setAmount] = useState("25");
  const key = useRef(crypto.randomUUID());
  const [checkingError, setCheckingError] = useState("");
  const id = useId();
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    return () => {
      generation.current++;
    };
  }, [a.user?.id, a.network]);
  const pending = snapshot.data?.transfers.find(active);
  const available =
    direction === "withdraw" ? balance : snapshot.data?.walletBalance;
  const valid =
    /^\d{1,7}(\.\d{1,6})?$/.test(amount) &&
    units(amount) > 0n &&
    units(amount) <= units("1000000");
  const insufficient =
    valid && available != null && units(amount) > units(available);
  async function refreshTransfer(transfer: UsdcTransfer) {
    await a.request({ action: "check", id: transfer.id }, path);
    await snapshot.refetch();
  }
  // Recover saved transfers on reopening the dialog. No new transaction is built.
  useEffect(() => {
    if (!pending || a.busy || a.network !== "devnet") return;
    let cancelled = false;
    let checking = false;
    const timer = setInterval(() => {
      if (checking) return;
      checking = true;
      void refreshTransfer(pending)
        .then(() => {
          if (!cancelled) setCheckingError("");
        })
        .catch(() => {
          if (!cancelled)
            setCheckingError(
              "Confirmation is unavailable. Your transfer is saved; check again shortly.",
            );
        })
        .finally(() => {
          checking = false;
        });
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pending?.id, pending?.state, a.busy, a.network, a.user?.id]);

  async function approve(transfer: UsdcTransfer) {
    const signingWallet = wallets.find((w) => w.address === transfer.wallet);
    if (!signingWallet)
      throw new Error("Connect the wallet used for this saved transfer.");
    if (!transfer.unsignedBase64)
      throw new Error("Check this transfer before continuing.");
    const current = generation.current;
    const signed = await signTransaction({
      wallet: signingWallet,
      transaction: Uint8Array.from(atob(transfer.unsignedBase64), (c) =>
        c.charCodeAt(0),
      ),
      chain: "solana:devnet",
    });
    if (current !== generation.current) return;
    await a.request(
      {
        action: "submit",
        id: transfer.id,
        signedBase64: btoa(String.fromCharCode(...signed.signedTransaction)),
      },
      path,
    );
    await snapshot.refetch();
  }
  async function begin() {
    if (!wallet) return;
    const current = generation.current;
    if (!verified) {
      const proof = await a.request<{ nonce: string; message: string }>(
        { address: wallet.address },
        "/api/wallet/challenge",
      );
      const signed = await signMessage({
        wallet,
        message: new TextEncoder().encode(proof.message),
      });
      if (current !== generation.current) return;
      await a.request(
        {
          nonce: proof.nonce,
          signature: btoa(String.fromCharCode(...signed.signature)),
        },
        "/api/wallet/verify",
      );
    }
    const transfer = await a.request<UsdcTransfer>(
      {
        action: "prepare",
        key: key.current,
        direction,
        amount,
        wallet: wallet.address,
      },
      path,
    );
    key.current = crypto.randomUUID();
    await snapshot.refetch();
    await approve(transfer);
  }
  return (
    <div className="usdc-transfer-panel">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(begin);
        }}
      >
        <label htmlFor={`${id}-wallet`}>Wallet</label>
        {wallet ? (
          <Select
            id={`${id}-wallet`}
            value={wallet.address}
            disabled={a.busy || !!pending}
            onChange={(e) => {
              setSelected(e.target.value);
              key.current = crypto.randomUUID();
            }}
          >
            {wallets.map((w) => (
              <option key={w.address} value={w.address}>
                {w.address.slice(0, 8)}…{w.address.slice(-6)}
              </option>
            ))}
          </Select>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => connectWallet({ walletChainType: "solana-only" })}
          >
            Connect wallet
          </Button>
        )}
        <label htmlFor={`${id}-amount`}>Amount · USDC</label>
        <input
          id={`${id}-amount`}
          type="number"
          min="0.000001"
          max="1000000"
          step="0.000001"
          required
          value={amount}
          disabled={a.busy || !!pending}
          onChange={(e) => {
            setAmount(e.target.value);
            key.current = crypto.randomUUID();
          }}
        />
        <p>
          {direction === "withdraw" ? "Available balance" : "Wallet balance"}{" "}
          {available == null ? "—" : <UsdcAmount value={available} />}
        </p>
        {insufficient && (
          <p role="status">
            {direction === "withdraw"
              ? "Enter an amount within your available balance."
              : "Your wallet has insufficient USDC on Devnet."}
          </p>
        )}
        {snapshot.isPending && <p role="status">Loading transfers…</p>}
        {snapshot.data && !snapshot.data.configured && (
          <p role="status">
            USDC transfers are not configured yet. Top up is still available.
          </p>
        )}
        <Button
          type="submit"
          disabled={
            a.busy ||
            !!pending ||
            !wallet ||
            !valid ||
            insufficient ||
            !snapshot.data?.configured
          }
        >
          {a.busy
            ? "Waiting for confirmation…"
            : direction === "withdraw"
              ? "Withdraw USDC"
              : "Deposit USDC"}
        </Button>
      </form>
      {(a.error || snapshot.error || checkingError) && (
        <p role="alert">
          {a.error || snapshot.error?.message || checkingError}
        </p>
      )}
      {snapshot.error && (
        <Button variant="outline" onClick={() => void snapshot.refetch()}>
          Retry
        </Button>
      )}
      {!!snapshot.data?.transfers.length && (
        <section
          className="usdc-transfer-history"
          aria-label="Recent transfers"
        >
          <h3>Recent transfers</h3>
          {snapshot.data.transfers.slice(0, 5).map((t) => (
            <div className="usdc-transfer-row" key={t.id}>
              <div>
                <strong>
                  {t.direction === "withdraw" ? "Withdrawal" : "Deposit"} ·{" "}
                  <UsdcAmount value={t.amount} />
                </strong>
                <p role="status">
                  {t.state === "confirmed"
                    ? "Complete"
                    : t.state === "refunded"
                      ? "Not sent · balance restored"
                      : t.state === "expired"
                        ? "Not deposited · try again"
                        : t.state === "submitted"
                          ? "Confirming on Devnet…"
                          : "Awaiting wallet approval"}
                </p>
                <a
                  href={`https://explorer.solana.com/tx/${t.signature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                </a>
              </div>
              {active(t) && (
                <div className="wallet-actions">
                  {t.state === "prepared" && (
                    <Button
                      size="sm"
                      disabled={a.busy}
                      onClick={() => void a.run(() => approve(t))}
                    >
                      Approve in wallet
                    </Button>
                  )}
                  {t.state === "submitted" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={a.busy}
                      onClick={() =>
                        void a.run(async () => {
                          await a.request({ action: "submit", id: t.id }, path);
                          await snapshot.refetch();
                        })
                      }
                    >
                      Retry same transfer
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={a.busy}
                    onClick={() => void a.run(() => refreshTransfer(t))}
                  >
                    Check status
                  </Button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
      <p className="usdc-transfer-note">
        Devnet · Test funds. Approve the transfer in your wallet. Closing this
        window keeps pending transfers saved.
      </p>
    </div>
  );
}
