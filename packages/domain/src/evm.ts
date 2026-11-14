import { z } from "zod";

export const evmAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((s) => s.toLowerCase() as `0x${string}`);
export const evmHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const evmAmount = z.string().regex(/^\d+$/);
export const evmChains = {
  8453: {
    name: "Base",
    paymentSymbol: "USDC",
    paymentToken: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    rpc: "https://mainnet.base.org",
    explorer: "https://basescan.org",
  },
  4663: {
    name: "Robinhood",
    paymentSymbol: "USDG",
    paymentToken: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
  },
} as const;
export type EvmChainId = keyof typeof evmChains;
export const evmChainId = z.union([z.literal(8453), z.literal(4663)]);
export const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3" as const;
export type PoolKey = {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
};
export type GrailMarket = {
  chainId: EvmChainId;
  buyToken: `0x${string}`;
  sellToken: `0x${string}`;
  symbol: string;
  decimals: number;
  paymentSymbol: string;
  paymentDecimals: number;
  protocol: "v3" | "v4";
  router: `0x${string}`;
  spender: `0x${string}`;
  pool: `0x${string}`;
  feePips: number;
  poolKey?: PoolKey;
};
export type GrailQuote = GrailMarket & {
  wallet: `0x${string}`;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount: string;
  expiresAt: string;
  blockNumber: string;
  slippageBps: number;
  nextAction: "approve_token" | "approve_router" | "swap";
  paymentBalance: string;
  nativeBalance: string;
};
export type GrailTransaction = {
  from: `0x${string}`;
  to: `0x${string}`;
  data: `0x${string}`;
  value: "0x0";
  chainId: `0x${string}`;
  nonce: `0x${string}`;
};
export type PreparedGrailAction = {
  action: GrailQuote["nextAction"];
  transaction: GrailTransaction;
  estimatedGasWei: string;
  preparedAt: string;
  startBlock: string;
};
export type GrailOrderView = {
  id: string;
  state: string;
  quote: GrailQuote;
  canSubmit: boolean;
  blocker: string | null;
  prepared?: PreparedGrailAction;
  transactionHash?: string;
  received?: string;
};
