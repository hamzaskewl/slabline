export type UsdcTransfer = {
  id: string;
  direction: "deposit" | "withdraw";
  amount: string;
  wallet: string;
  mint: string;
  state: "prepared" | "submitted" | "confirmed" | "refunded" | "expired";
  signature: string;
  unsignedBase64?: string;
  createdAt: string;
};

export type UsdcTransferAccount = {
  configured: boolean;
  mint: string | null;
  walletBalance: string | null;
  transfers: UsdcTransfer[];
};
