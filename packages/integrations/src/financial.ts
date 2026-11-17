import {
  IntegrationBlocked,
  type Listing,
  type FundingState,
} from "@collectible/domain";
import {
  buildCollectorCryptDevnetDraft,
  type CollectorCryptDraft,
} from "./collector-crypt";
export type FinancialApproval = {
  userId: string;
  wallet: string;
  network: "devnet" | "mainnet";
  idempotencyKey: string;
  approvedAt: string;
};
export type FundingQuote = {
  route: "manual" | "direct_solana" | "owned_evm_then_relay";
  amount: string;
  networkFee: string | null;
  conversionFee: string | null;
  bridgeFee: string | null;
  netSpendable: string | null;
  state: FundingState;
  blockers: string[];
};
export interface GeminiTradingAdapter {
  placeOrder(input: {
    symbol: string;
    side: "yes" | "no";
    quantity: string;
    limitPrice: string;
    approval: FinancialApproval;
  }): Promise<{ providerOrderId: string }>;
  cancelOrder(orderId: string, approval: FinancialApproval): Promise<void>;
  withdrawUSDC(input: {
    amount: string;
    network: "solana" | "ethereum";
    approval: FinancialApproval;
  }): Promise<{ transferId: string }>;
}
export const blockedGeminiTrading: GeminiTradingAdapter = {
  async placeOrder() {
    throw new IntegrationBlocked(
      "Gemini trading",
      "OAuth orders:create, current terms, jurisdiction eligibility and production review are unverified",
    );
  },
  async cancelOrder() {
    throw new IntegrationBlocked(
      "Gemini trading",
      "Authorized trading session is not configured",
    );
  },
  async withdrawUSDC() {
    throw new IntegrationBlocked(
      "Gemini withdrawal",
      "Account-specific v2 network access, crypto:send, approved destination/hold, available balance, conversion and fee reconciliation have not been verified",
    );
  },
};
export function getFundingQuote(amount: string): FundingQuote {
  return {
    route: "manual",
    amount,
    networkFee: null,
    conversionFee: null,
    bridgeFee: null,
    netSpendable: null,
    state: "unsupported",
    blockers: [
      "Gemini available USD and conversion fills must be verified",
      "Account-specific GET /v2/network/USDC and crypto:send must be authorized",
      "Approved user-owned destination, address hold and withdrawal fees must be verified",
      "Relay fallback requires a live owned-EVM-wallet quote, screening and expiry checks",
    ],
  };
}
export interface CollectorCryptTransactionAdapter {
  buildBuyTransaction(
    card: Listing,
    buyer: string,
  ): Promise<CollectorCryptDraft>;
  broadcastSignedTransaction(
    signedBase64: string,
    approval: FinancialApproval,
  ): Promise<{ signature: string }>;
}
export const collectorCryptTransactions: CollectorCryptTransactionAdapter = {
  buildBuyTransaction: buildCollectorCryptDevnetDraft,
  async broadcastSignedTransaction() {
    throw new IntegrationBlocked(
      "Collector Crypt",
      "Transaction program/recipient/amount inspection and a signed devnet purchase test are required before broadcast is released",
    );
  },
};
// Compatibility name for existing callers. Quotes are real; execution stays blocked.
export { relayAdapter as blockedRelay } from "./relay";
export const blockedPhygitals = {
  async buyPack(_input: {
    slug: string;
    approval: FinancialApproval;
  }): Promise<{ orderId: string }> {
    throw new IntegrationBlocked(
      "Phygitals",
      "User-scoped API key with vm.buy.crypto and a verified signed payment are required",
    );
  },
};
export const SIMULATED_PARTIAL_CART_FIXTURE = {
  name: "SIMULATED_PARTIAL_CART_FAILURE",
  network: "fixture",
  items: [
    { mint: "FIXTURE-CARD-A", state: "owner_verified" },
    { mint: "FIXTURE-CARD-B", state: "failed" },
  ],
  note: "Invented test states only. No chain transaction, ownership or funds.",
} as const;
