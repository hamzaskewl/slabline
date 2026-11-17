import { z } from "zod";
import { evmAddress } from "./evm";

const native = "0x0000000000000000000000000000000000000000";
const solanaUsdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const relayRoutes = {
  "base-sepolia-sepolia": {
    name: "Base Sepolia → Sepolia",
    environment: "testnet",
    originChainId: 84532,
    destinationChainId: 11155111,
    originCurrency: native,
    destinationCurrency: native,
    decimals: 18,
    symbol: "test ETH",
    originName: "Base Sepolia",
    destinationName: "Sepolia",
    destinationNetwork: "eip155",
  },
  "sepolia-base-sepolia": {
    name: "Sepolia → Base Sepolia",
    environment: "testnet",
    originChainId: 11155111,
    destinationChainId: 84532,
    originCurrency: native,
    destinationCurrency: native,
    decimals: 18,
    symbol: "test ETH",
    originName: "Sepolia",
    destinationName: "Base Sepolia",
    destinationNetwork: "eip155",
  },
  "ethereum-solana": {
    name: "Ethereum USDC → Solana USDC",
    environment: "mainnet",
    originChainId: 1,
    destinationChainId: 792703809,
    originCurrency: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    destinationCurrency: solanaUsdc,
    decimals: 6,
    symbol: "USDC",
    originName: "Ethereum",
    destinationName: "Solana",
    destinationNetwork: "solana",
  },
  "base-solana": {
    name: "Base USDC → Solana USDC",
    environment: "mainnet",
    originChainId: 8453,
    destinationChainId: 792703809,
    originCurrency: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    destinationCurrency: solanaUsdc,
    decimals: 6,
    symbol: "USDC",
    originName: "Base",
    destinationName: "Solana",
    destinationNetwork: "solana",
  },
} as const;
export type RelayRouteId = keyof typeof relayRoutes;
export const relayRouteId = z.enum([
  "base-sepolia-sepolia",
  "sepolia-base-sepolia",
  "ethereum-solana",
  "base-solana",
]);
export const relayQuoteInput = z
  .object({
    routeId: relayRouteId,
    wallet: evmAddress,
    recipient: z.string().min(32).max(44),
    amount: z
      .string()
      .max(40)
      .regex(/^\d+(\.\d{1,18})?$/),
  })
  .strict();
export type RelayQuoteInput = z.infer<typeof relayQuoteInput>;
export function relayAmount(input: RelayQuoteInput) {
  const route = relayRoutes[input.routeId];
  const [whole, fraction = ""] = input.amount.split(".");
  if (fraction.length > route.decimals)
    throw new Error(`Use at most ${route.decimals} decimal places`);
  const value =
    BigInt(whole!) * 10n ** BigInt(route.decimals) +
    BigInt(fraction.padEnd(route.decimals, "0"));
  if (
    value <= 0n ||
    value >
      (route.environment === "testnet" ? 10n ** 18n : 1000000n * 10n ** 6n)
  )
    throw new Error("Amount is outside the supported quote range");
  return value.toString();
}
export function relayInputKey(input: RelayQuoteInput) {
  return JSON.stringify([
    input.routeId,
    input.wallet.toLowerCase(),
    input.recipient,
    relayAmount(input),
  ]);
}
export function relayFormat(value: string, decimals: number) {
  const amount = BigInt(value),
    sign = amount < 0n ? "-" : "",
    positive = amount < 0n ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const fraction = (positive % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${sign}${positive / scale}${fraction ? `.${fraction}` : ""}`;
}
export type RelayFee = {
  amount: string;
  formatted: string;
  symbol: string;
  chainId: number;
  currency: string;
  decimals: number;
  usd: string | null;
};
export type RelayQuote = {
  source: "relay";
  input: RelayQuoteInput;
  environment: "mainnet" | "testnet";
  requestId: string;
  amountIn: string;
  amountOut: string;
  minimumOut: string;
  fees: {
    originGas: RelayFee;
    relayer: RelayFee;
    destinationGas: RelayFee | null;
    service: RelayFee | null;
    app: RelayFee | null;
  };
  sourceBalance: string | null;
  sourceBalanceAfterPrincipal: string | null;
  sufficientPrincipal: boolean | null;
  timeEstimateSeconds: number;
  steps: ("approval" | "deposit")[];
  quotedAt: string;
  expiresAt: string;
  canExecute: false;
  gasSponsorship: false;
};
export type RelayStatus = {
  providerState:
    | "waiting"
    | "depositing"
    | "pending"
    | "submitted"
    | "success"
    | "failure"
    | "refund";
  originHashes: string[];
  destinationHashes: string[];
  checkedAt: string;
  independentlyConfirmed: false;
};
export type RelayRecord = {
  id: string;
  state: string;
  quote: RelayQuote | null;
  status: RelayStatus | null;
  error: string | null;
  canExecute: false;
  moneyMovedByApp: false;
};
