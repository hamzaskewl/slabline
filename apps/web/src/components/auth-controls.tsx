"use client";
import { useSlablineAuth } from "./sign-in-dialog";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivateRead } from "@/lib/use-private-read";
import { relayFormat } from "@collectible/domain";
import { useConnectWallet } from "@privy-io/react-auth";
import { useWallets, useSignMessage } from "@privy-io/react-auth/solana";
import { Button } from "./ui/button";
import { useNetwork } from "./network-settings";
import { Wallet, ShieldCheck, ArrowUpRight } from "lucide-react";

export function AuthButton({ header = false }: { header?: boolean }) {
  const { ready, authenticated, login, logout } = useSlablineAuth();
  if (header && !authenticated)
    return (
      <div className="header-auth-actions">
        <Button size="sm" variant="ghost" disabled={!ready} onClick={login}>
          Log in
        </Button>
        <Button
          size="sm"
          className="auth-signup"
          disabled={!ready}
          onClick={login}
        >
          Sign up
        </Button>
      </div>
    );
  return (
    <Button
      size="sm"
      disabled={!ready}
      onClick={(event) => (authenticated ? void logout() : login(event))}
    >
      {authenticated ? "Sign out" : "Log in"}
    </Button>
  );
}
export function ConnectedWalletPanel() {
  const { network } = useNetwork();
  const { authenticated, login, getAccessToken, user } = useSlablineAuth();
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const { signMessage } = useSignMessage();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const links = usePrivateRead<{
    network: string;
    wallets: { address: string }[];
  }>("/api/wallet/links");
  const queryClient = useQueryClient(),
    generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setMessage("");
  }, [user?.id, authenticated]);
  async function prove(index: number) {
    const wallet = wallets[index];
    if (!wallet) return;
    setBusy(true);
    setMessage("");
    const current = generation.current;
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sign in first");
      const headers = {
        Authorization: `Bearer ${token}`,
        "X-Market-Network": network,
        "Content-Type": "application/json",
      };
      const challengeResponse = await fetch("/api/wallet/challenge", {
        method: "POST",
        headers,
        body: JSON.stringify({ address: wallet.address }),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok)
        throw new Error(challenge.error ?? "Challenge unavailable");
      const signed = await signMessage({
        wallet,
        message: new TextEncoder().encode(challenge.message),
      });
      if (current !== generation.current) return;
      const signature = btoa(String.fromCharCode(...signed.signature));
      const response = await fetch("/api/wallet/verify", {
        method: "POST",
        headers,
        body: JSON.stringify({ nonce: challenge.nonce, signature }),
      });
      const result = await response.json();
      if (current !== generation.current) return;
      if (!response.ok) throw new Error(result.error ?? "Wallet proof failed");
      setMessage("Wallet verified.");
      await links.refetch();
      await queryClient.invalidateQueries({
        queryKey: ["private-read", user?.id],
      });
    } catch (e) {
      if (current === generation.current)
        setMessage(
          e instanceof Error ? e.message : "Wallet verification failed",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel funding-panel account-panel">
      <h2>
        Solana wallets{links.data?.network === "devnet" ? " · Devnet" : ""}
      </h2>

      {authenticated ? (
        <>
          <div className="wallet-actions">
            <Button
              onClick={() => connectWallet({ walletChainType: "solana-only" })}
            >
              Connect Phantom / external wallet
            </Button>
          </div>
          {wallets.map((w, i) => (
            <div className="connected-wallet" key={w.address}>
              <Wallet size={18} />
              <code>{w.address}</code>
              <Button size="sm" disabled={busy} onClick={() => void prove(i)}>
                <ShieldCheck size={14} />{" "}
                {links.data?.wallets.some((l) => l.address === w.address)
                  ? "Verify again"
                  : "Verify wallet"}
              </Button>
              <WalletBalances
                wallet={w.address}
                verified={
                  !!links.data?.wallets.some((l) => l.address === w.address)
                }
              />
              {network === "devnet" && (
                <div className="wallet-actions">
                  <a
                    href="https://faucet.solana.com/"
                    className="button button-outline button-pill"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get SOL <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                  <a
                    href="https://faucet.circle.com/"
                    className="button button-outline button-pill"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get USDC <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                </div>
              )}
            </div>
          ))}
        </>
      ) : (
        <Button onClick={login}>Continue with Google or email</Button>
      )}
      {authenticated && links.error ? (
        <>
          <p role="alert">{links.error.message}</p>
          <Button variant="outline" onClick={() => void links.refetch()}>
            Retry wallet links
          </Button>
        </>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
function WalletBalances({
  wallet,
  verified,
}: {
  wallet: string;
  verified: boolean;
}) {
  const query = usePrivateRead<{
    network: string;
    solLamports: string;
    usdc: string | null;
    observedAt: string;
  }>(`/api/wallet/balances?address=${encodeURIComponent(wallet)}`, verified);
  if (!verified) return null;
  return (
    <div className="wallet-balance-read">
      <Button
        size="sm"
        variant="outline"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        {query.isFetching ? "Reading balances…" : "Refresh balances"}
      </Button>
      {query.error ? (
        <p role="alert">
          Balances unavailable.{" "}
          {query.data
            ? "The saved balances below may be outdated."
            : "Try again shortly."}
        </p>
      ) : null}
      {query.data ? (
        <>
          <p>
            {relayFormat(query.data.solLamports, 9)} SOL ·{" "}
            {query.data.usdc ?? "Unavailable"}{" "}
            {query.data.network === "devnet" ? "test USDC" : "USDC"}
          </p>
        </>
      ) : null}
    </div>
  );
}
