export const PULL_TIERS = [25, 50, 100, 200] as const;
export type PullTier = (typeof PULL_TIERS)[number];

export const PULL_OUTCOMES = [
  { multiplier: "0.6", multiplierBps: 6000, weightBps: 6200 },
  { multiplier: "1.2", multiplierBps: 12000, weightBps: 2800 },
  { multiplier: "2", multiplierBps: 20000, weightBps: 640 },
  { multiplier: "4", multiplierBps: 40000, weightBps: 360 },
] as const;
export type PullMultiplier = (typeof PULL_OUTCOMES)[number]["multiplier"];

export function pullOutcome(bucket: number) {
  if (!Number.isInteger(bucket) || bucket < 0 || bucket >= 10000)
    throw new RangeError("Invalid Pull & Predict outcome bucket.");
  let boundary = 0;
  for (const outcome of PULL_OUTCOMES) {
    boundary += outcome.weightBps;
    if (bucket < boundary) return outcome;
  }
  throw new Error("Incomplete Pull & Predict odds table.");
}

export type PullRandomnessSource = "demo-csprng" | "magicblock-devnet";
export type PullTheme =
  { kind: "all" } | { kind: "team" | "player"; label: string };
export type PullProof = {
  programId: string;
  seedHex: string;
  requestAddress: string;
  requestSignature: string;
  randomnessHex: string;
  slot: string;
};

export type PullOpening = {
  id: string;
  version: 1;
  price: string;
  tier: PullTier;
  state: "pending" | "ready" | "redeemed";
  budget: string | null;
  multiplier: PullMultiplier | null;
  randomnessSource: PullRandomnessSource;
  proof: PullProof | null;
  createdAt: string;
  positionId: string | null;
  redemption: {
    eventTicker: string;
    symbol: string;
    side: "yes" | "no";
    cost: string;
    quantity: string;
    remainder: string;
  } | null;
  payer: string | null;
  programId: string | null;
  theme: PullTheme;
};
