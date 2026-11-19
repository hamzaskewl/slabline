"use client";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowRight, Wallet } from "lucide-react";
import { Button } from "./ui/button";
import { AuthButton, ConnectedWalletPanel } from "./auth-controls";
import { PrivateAccount } from "./private-account";
import RelayFunding from "./relay-funding";

export default function WalletOverview() {
  const { ready, authenticated, login } = usePrivy();
  if (!ready) return <p role="status">Loading your account…</p>;
  if (!authenticated)
    return (
      <section className="wallet-welcome">
        <Wallet size={28} aria-hidden="true" />
        <h2>Your accounts, in one place</h2>
        <p>
          Sign in with Google, email, or your wallet. Then connect Gemini or
          verify a Solana wallet to view balances and collectibles.
        </p>
        <Button onClick={login}>
          Log in / Sign up <ArrowRight size={17} />
        </Button>
        <div className="account-capabilities">
          <div>
            <h3>Gemini account</h3>
            <p>
              Separate authorization for available USD, positions, and orders.
            </p>
          </div>
          <div>
            <h3>Solana wallet</h3>
            <p>Verify your wallet to view its balances and collection.</p>
          </div>
          <div>
            <h3>Bridge previews</h3>
            <p>Review a route and fees. Quotes do not transfer funds.</p>
          </div>
        </div>
        <Link className="text-link" href="/practice">
          Explore a practice prediction <ArrowRight size={15} />
        </Link>
      </section>
    );
  return (
    <>
      <div className="wallet-session-actions">
        <AuthButton />
        <p>Gemini funds and wallet balances stay separate.</p>
      </div>
      <div className="wallet-account-grid">
        <PrivateAccount compact />
        <ConnectedWalletPanel />
      </div>
      <RelayFunding />
    </>
  );
}
