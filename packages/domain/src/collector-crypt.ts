import type { Listing } from "./index";
export type CcTestView = {
  id: string;
  network: "devnet";
  state: string;
  card: Listing | null;
  wallet: string;
  canSign: boolean;
  canRetry: boolean;
  blocker: string | null;
  expiresAt: string | null;
  unsignedBase64?: string;
  signature: string | null;
  simulation: {
    source: "solana_simulation";
    feeLamports: string;
    totalSolCostLamports: string;
    priceBaseUnits: string;
    platformFeeBaseUnits: string;
    slot: string;
    moneyMoved: false;
  } | null;
  ownership: {
    owner: string | null;
    verified: boolean;
    source: "core_rpc";
    slot: string;
  } | null;
  error: string | null;
};
