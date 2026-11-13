"use client";
import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
const connectors = toSolanaWalletConnectors({ shouldAutoConnect: true });
export default function AuthProvider({
  children,
  appId,
}: {
  children: ReactNode;
  appId: string;
}) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["google", "email", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#2e5cff",
          walletChainType: "solana-only",
          walletList: ["phantom", "solflare", "backpack"],
        },
        embeddedWallets: { solana: { createOnLogin: "users-without-wallets" } },
        externalWallets: { solana: { connectors } },
        solana: {
          rpcs: {
            "solana:devnet": {
              rpc: createSolanaRpc("https://api.devnet.solana.com"),
              rpcSubscriptions: createSolanaRpcSubscriptions(
                "wss://api.devnet.solana.com",
              ),
              blockExplorerUrl: "https://explorer.solana.com",
            },
            "solana:mainnet": {
              rpc: createSolanaRpc("https://api.mainnet-beta.solana.com"),
              rpcSubscriptions: createSolanaRpcSubscriptions(
                "wss://api.mainnet-beta.solana.com",
              ),
              blockExplorerUrl: "https://explorer.solana.com",
            },
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
