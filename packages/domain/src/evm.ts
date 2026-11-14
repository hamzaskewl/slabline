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
export const typedDataSchema = z
  .object({
    domain: z
      .object({
        name: z.string(),
        version: z.string().optional(),
        chainId: z.coerce.number().int(),
        verifyingContract: evmAddress,
      })
      .strict(),
    types: z.record(
      z.string(),
      z.array(z.object({ name: z.string(), type: z.string() }).strict()),
    ),
    primaryType: z.string(),
    message: z.record(z.string(), z.unknown()),
  })
  .strict();
export type EvmTypedData = z.infer<typeof typedDataSchema>;
export type GrailQuote = {
  chainId: EvmChainId;
  wallet: `0x${string}`;
  buyToken: `0x${string}`;
  symbol: string;
  decimals: number;
  paymentSymbol: string;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount: string;
  fees: { label: string; amount: string; symbol: string; decimals: number }[];
  expiresAt: string;
  approvalRequired: boolean;
  approvalTransaction: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: "0x0";
  } | null;
  trade: {
    type: "settler_metatransaction";
    hash: string;
    eip712: EvmTypedData;
  };
};
export type GrailOrderView = {
  id: string;
  state: string;
  quote: GrailQuote;
  canSubmit: boolean;
  blocker: string | null;
  transactionHash?: string;
  received?: string;
};
