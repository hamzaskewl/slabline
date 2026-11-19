export type GeminiConnection = {
  environment: "sandbox" | "production";
  linked: boolean;
  scopes: string[];
  canConnect: boolean;
  canRead: boolean;
  blocker: string | null;
};
export type GeminiSnapshot = {
  balances: {
    currency: string;
    available: string | null;
    availableForWithdrawal: string | null;
  }[];
  positions: {
    symbol: string;
    quantity: string | null;
    outcome: string | null;
    marketValue: string | null;
    averageEntryPrice?: string | null;
    payoutPerShare?: string | null;
    resolutionSide?: string | null;
    context?: GeminiPositionContext;
  }[];
  settlements: {
    symbol: string;
    payout: string | null;
    settledAt: string | null;
    outcome?: string | null;
    resolutionSide?: string | null;
    quantity?: string | null;
    costBasis?: string | null;
    realizedPnl?: string | null;
    context?: GeminiPositionContext;
  }[];
  activeOrders: {
    id: string | null;
    symbol: string;
    side: string | null;
    outcome: string | null;
    price: string | null;
    remainingQuantity: string | null;
    status: string | null;
  }[];
  observedAt: string;
};
export type GeminiPositionContext = {
  title: string | null;
  label: string | null;
  eventTicker: string | null;
  contractStatus: string | null;
  eventType: string | null;
};
export type WalletCollectible = {
  mint: string;
  name: string;
  imageUrl: string | null;
  interface: string;
  valuation?: import("./index").Valuation | null;
};
export type WalletCollection = {
  wallet: string;
  network: "devnet" | "mainnet";
  assets: WalletCollectible[];
  page: number;
  hasMore: boolean;
  observedAt: string;
  source: "das";
};
