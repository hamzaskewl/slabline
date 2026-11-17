"use client";
import type { ReactNode } from "react";
import { base, baseSepolia, mainnet, sepolia } from "viem/chains";
import { defineChain } from "viem";
import { evmChains } from "@collectible/domain";
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
          walletChainType: "ethereum-and-solana",
          walletList: [
            "detected_wallets",
            "metamask",
            "coinbase_wallet",
            "phantom",
            "solflare",
            "backpack",
          ],
        },
        defaultChain: base,
        supportedChains: [
          base,
          baseSepolia,
          mainnet,
          sepolia,
          defineChain({
            id: 46630,
            name: "Robinhood Testnet",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: {
              default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
            },
            testnet: true,
          }),
          defineChain({
            id: 4663,
            name: "Robinhood",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: { default: { http: [evmChains[4663].rpc] } },
            blockExplorers: {
              default: { name: "Blockscout", url: evmChains[4663].explorer },
            },
          }),
        ],
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
          ethereum: { createOnLogin: "users-without-wallets" },
        },
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
