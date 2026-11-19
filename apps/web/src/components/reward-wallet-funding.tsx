"use client";
import { useState } from "react";
import { usePrivateRead } from "@/lib/use-private-read";
import { useNetwork } from "./network-settings";
import { Button } from "./ui/button";
import { usdc } from "@/lib/utils";
import { units } from "@collectible/domain";

export function RewardWalletFunding({
  wallet,
  verified,
  amount,
}: {
  wallet: string;
  verified: boolean;
  amount: string;
}) {
  const { network } = useNetwork();
  const [copied, setCopied] = useState("");
  const balance = usePrivateRead<{ usdc: string | null; network: string }>(
    `/api/wallet/balances?address=${encodeURIComponent(wallet)}`,
    verified,
  );
  const available = balance.data?.usdc;
  const shortfall = available != null && units(available) < units(amount);
  return (
    <div className="reward-wallet-funding">
      <p>
        {usdc(amount)} {network === "devnet" ? "test USDC" : "USDC"} will be
        paid from this wallet when you sign for your card. SOL covers network
        fees.
      </p>
      <div className="reward-funding-address">
        <code>{wallet}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void navigator.clipboard.writeText(wallet).then(
              () => setCopied(wallet),
              () => setCopied(""),
            )
          }
        >
          {copied === wallet ? "Copied" : "Copy address"}
        </Button>
      </div>
      <div className="reward-funding-balance">
        <span>
          {balance.error
            ? "Balance unavailable. Retry to check funds."
            : available != null
              ? `${usdc(available)} ${network === "devnet" ? "test USDC" : "USDC"} in wallet${shortfall ? " · Add funds to this address" : ""}`
              : verified
                ? "Checking wallet balance…"
                : "Confirm rewards to verify this wallet."}
        </span>
        {verified && (
          <button
            className="text-button"
            disabled={balance.isFetching}
            onClick={() => void balance.refetch()}
          >
            Refresh balance
          </button>
        )}
      </div>
    </div>
  );
}
