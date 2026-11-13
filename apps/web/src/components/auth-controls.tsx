"use client";
import { useState } from "react";
import { usePrivy, useConnectWallet } from "@privy-io/react-auth";
import { useWallets, useSignMessage } from "@privy-io/react-auth/solana";
import { Button } from "./ui/button";
import { Wallet, ShieldCheck } from "lucide-react";

export function AuthButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  return (
    <Button
      size="sm"
      disabled={!ready}
      onClick={() => (authenticated ? void logout() : login())}
    >
      {authenticated ? "Sign out" : "Log in / Sign up"}
    </Button>
  );
}
export function ConnectedWalletPanel() {
  const { authenticated, login, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const { signMessage } = useSignMessage();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [balances, setBalances] = useState<
    Record<
      string,
      { solLamports: string; usdc: string | null; network: string }
    >
  >({});
  async function readBalances(wallet: string) {
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/wallet/balances?address=${encodeURIComponent(wallet)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Balance lookup failed");
      setBalances((previous) => ({ ...previous, [wallet]: data }));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Balances unavailable");
    }
  }
  async function prove(index: number) {
    const wallet = wallets[index];
    if (!wallet) return;
    setBusy(true);
    setMessage("");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sign in first");
      const headers = {
        Authorization: `Bearer ${token}`,
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
      const signature = btoa(String.fromCharCode(...signed.signature));
      const response = await fetch("/api/wallet/verify", {
        method: "POST",
        headers,
        body: JSON.stringify({ nonce: challenge.nonce, signature }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Wallet proof failed");
      setMessage("Wallet signature verified and link saved. No funds moved.");
      await readBalances(wallet.address);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Wallet verification failed");
    } finally {
      setBusy(false);
    }
  }
  async function linkGemini() {
    setBusy(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/gemini/connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Gemini connection unavailable");
      window.location.assign(result.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gemini connection failed");
      setBusy(false);
    }
  }
  return (
    <section className="panel funding-panel">
      <h2>Connect and verify your wallet</h2>
      <p>
        Google or email signs you into this app. Gemini is a separate account
        connection. A wallet signature proves your selected destination.
      </p>
      {authenticated ? (
        <>
          <div className="wallet-actions">
            <Button
              onClick={() => connectWallet({ walletChainType: "solana-only" })}
            >
              Connect Phantom / external wallet
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void linkGemini()}
            >
              Link Gemini account
            </Button>
          </div>
          {wallets.map((w, i) => (
            <div className="connected-wallet" key={w.address}>
              <Wallet size={18} />
              <code>{w.address}</code>
              <Button size="sm" disabled={busy} onClick={() => void prove(i)}>
                <ShieldCheck size={14} /> Verify wallet
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void readBalances(w.address)}
              >
                Refresh balances
              </Button>
              {balances[w.address] ? (
                <p>
                  {balances[w.address]!.network.toUpperCase()} ·{" "}
                  {Number(balances[w.address]!.solLamports) / 1e9} SOL ·{" "}
                  {balances[w.address]!.usdc ?? "USDC mint not configured"}
                </p>
              ) : null}
            </div>
          ))}
        </>
      ) : (
        <Button onClick={login}>Continue with Google or email</Button>
      )}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
