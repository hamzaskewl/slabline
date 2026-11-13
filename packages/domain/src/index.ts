import { z } from "zod";

export const decimal = z.string().regex(/^\d+(\.\d{1,6})?$/);
export const levelSchema = z.object({ price: decimal, quantity: decimal });
export type Level = z.infer<typeof levelSchema>;
export type Book = {
  symbol: string;
  bids: Level[];
  asks: Level[];
  updatedAt: string;
  stale: boolean;
  source: "gemini" | "fixture";
  quantityIncrement: string;
  priceIncrement: string;
  quantityMinimum?: string;
  priceMinimum?: string;
  quoteAssetPrecision?: number;
};
export type Contract = {
  symbol: string;
  label: string;
  status: string;
  lastPrice: string | null;
  quantityIncrement: string | null;
  priceIncrement: string | null;
  quantityMinimum?: string;
  priceMinimum?: string;
  quoteAssetPrecision?: number;
};
export type Market = {
  id: string;
  ticker?: string;
  title: string;
  category: string;
  status: string;
  imageUrl: string | null;
  contracts: Contract[];
  children: Market[];
  description: string;
  closesAt: string | null;
};
export type Listing = {
  id: string;
  mint: string;
  name: string;
  category: string;
  player: string | null;
  grade: string | null;
  grader: string | null;
  cert: string | null;
  year: string | null;
  set: string | null;
  frontImage: string | null;
  backImage: string | null;
  ask: string;
  currency: "USDC";
  seller: string | null;
  network: "mainnet" | "devnet";
  source: "collectorcrypt";
  observedAt: string;
  valuation: Valuation | null;
};
export type Valuation = {
  providerId: string;
  fmv: string;
  confidence: "exact" | "low";
  methodology: string;
  observedAt: string;
  expiresAt: string;
  comps: { amount: string; soldAt: string; url: string }[];
};
export type Pack = {
  id: string;
  slug: string;
  name: string;
  price: string;
  image: string | null;
  inStock: boolean;
  source: "phygitals";
  network: "mainnet";
};
export type ProviderResult<T> = {
  data: T;
  source: "live" | "fixture" | "unavailable";
  observedAt: string;
  error: string | null;
};
const storedImage = z
  .string()
  .url()
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      [
        "arweave.net",
        "d1xpxki1g4htqu.cloudfront.net",
        "ipfs.io",
        "gateway.pinata.cloud",
      ].includes(u.hostname)
    );
  })
  .nullable();
export const storedListingSchema = z.object({
  id: z.string().max(150),
  mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  name: z.string().max(1000),
  category: z.string().max(100),
  player: z.string().nullable(),
  grade: z.string().nullable(),
  grader: z.string().nullable(),
  cert: z.string().nullable(),
  year: z.string().nullable(),
  set: z.string().nullable(),
  frontImage: storedImage,
  backImage: storedImage,
  ask: decimal,
  currency: z.literal("USDC"),
  seller: z.string().nullable(),
  network: z.enum(["mainnet", "devnet"]),
  source: z.literal("collectorcrypt"),
  observedAt: z.string().datetime(),
  valuation: z.preprocess(() => null, z.null()),
});

const SCALE = 1_000_000n;
export function units(value: string): bigint {
  decimal.parse(value);
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
}
export function money(value: bigint): string {
  if (value < 0n) throw new Error("Negative monetary value");
  return `${value / SCALE}.${(value % SCALE).toString().padStart(6, "0")}`;
}
const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
export function quoteDepth(input: {
  stake: string;
  asks: Level[];
  quantityIncrement: string;
  priceIncrement?: string;
  quantityMinimum?: string;
  priceMinimum?: string;
  quoteAssetPrecision?: number;
  feeBps: number | null;
}) {
  const budget = units(input.stake);
  const lot = units(input.quantityIncrement);
  const tick = input.priceIncrement ? units(input.priceIncrement) : 1n;
  const priceMinimum = input.priceMinimum ? units(input.priceMinimum) : 0n;
  const quantityMinimum = input.quantityMinimum
    ? units(input.quantityMinimum)
    : lot;
  const precision = input.quoteAssetPrecision ?? 6;
  if (!Number.isInteger(precision) || precision < 0 || precision > 6)
    throw new Error("Unsupported quote precision");
  const quoteUnit = 10n ** BigInt(6 - precision);
  if (lot <= 0n || tick <= 0n || budget > units("1000000"))
    throw new Error("Invalid budget or increments");
  if (
    input.feeBps !== null &&
    (!Number.isInteger(input.feeBps) ||
      input.feeBps < 0 ||
      input.feeBps > 10000)
  )
    throw new Error("Invalid fee policy");
  const bps = BigInt(input.feeBps ?? 0);
  const levels = input.asks
    .map((level) => ({
      price: units(level.price),
      quantity: units(level.quantity),
    }))
    .sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
  let remaining = budget,
    cost = 0n,
    fees = 0n,
    quantity = 0n;
  const fills: { price: string; quantity: string }[] = [];
  for (const level of levels) {
    if (
      level.price <= 0n ||
      level.price >= SCALE ||
      level.price < priceMinimum ||
      (level.price - priceMinimum) % tick !== 0n
    )
      throw new Error("Off-grid book price");
    const costFor = (q: bigint) =>
      ceil(level.price * q, SCALE * quoteUnit) * quoteUnit;
    const feeFor = (c: bigint) => ceil(c * bps, 10000n * quoteUnit) * quoteUnit;
    const total = (q: bigint) => {
      const c = costFor(q);
      return c + feeFor(c);
    };
    let low = 0n,
      high = level.quantity / lot;
    while (low < high) {
      const mid = (low + high + 1n) / 2n;
      if (total(mid * lot) <= remaining) low = mid;
      else high = mid - 1n;
    }
    const q = low * lot;
    if (!q) break; // cannot skip a cheaper executable level to reach a more expensive one
    const c = costFor(q),
      f = feeFor(c);
    remaining -= c + f;
    cost += c;
    fees += f;
    quantity += q;
    fills.push({ price: money(level.price), quantity: money(q) });
    if (q < level.quantity - (level.quantity % lot)) break;
  }
  if (quantity < quantityMinimum)
    return {
      contracts: money(0n),
      cost: money(0n),
      fees: input.feeBps === null ? null : money(0n),
      totalPayout: money(0n),
      unspent: money(budget),
      feesVerified: input.feeBps !== null,
      fills: [],
      exhausted: false,
    };
  return {
    contracts: money(quantity),
    cost: money(cost),
    fees: input.feeBps === null ? null : money(fees),
    totalPayout: money(quantity),
    unspent: money(remaining),
    feesVerified: input.feeBps !== null,
    fills,
    exhausted:
      quantity > 0n && fills.length === levels.length && remaining > 0n,
  };
}

export function asksForSide(book: Book, side: "yes" | "no"): Level[] {
  return side === "yes"
    ? book.asks
    : book.bids.map((l) => ({
        price: money(SCALE - units(l.price)),
        quantity: l.quantity,
      }));
}

export function validateCart(items: Listing[], budget: string) {
  if (new Set(items.map((i) => i.mint)).size !== items.length)
    throw new Error("Duplicate asset");
  const total = items.reduce((sum, item) => sum + units(item.ask), 0n);
  if (total > units(budget)) throw new Error("Cart exceeds spendable budget");
  return { total: money(total), remaining: money(units(budget) - total) };
}
export function assertFreshListing(listing: Listing, now = Date.now()) {
  if (
    now - Date.parse(listing.observedAt) > 60000 ||
    !Number.isFinite(Date.parse(listing.observedAt))
  )
    throw new Error("Listing is stale; recheck price and availability");
  if (!listing.grade || !listing.grader || !listing.cert)
    throw new Error("Grading identity is unverified");
  if (units(listing.ask) <= 0n) throw new Error("Invalid listing price");
}
export const purchaseStates = [
  "pending",
  "building",
  "awaiting_signature",
  "broadcast",
  "confirmed",
  "owner_verified",
  "failed",
  "expired",
  "reconciliation_required",
] as const;
export type PurchaseState = (typeof purchaseStates)[number];
const purchaseTransitions: Partial<Record<PurchaseState, PurchaseState[]>> = {
  pending: ["building", "failed"],
  building: ["awaiting_signature", "failed"],
  awaiting_signature: ["broadcast", "expired", "failed"],
  broadcast: ["confirmed", "failed", "reconciliation_required"],
  confirmed: ["owner_verified", "reconciliation_required"],
  reconciliation_required: ["confirmed", "owner_verified", "failed"],
};
export function transitionPurchase(from: PurchaseState, to: PurchaseState) {
  if (!purchaseTransitions[from]?.includes(to))
    throw new Error(`Invalid purchase transition ${from} -> ${to}`);
  return to;
}
export function matchingCards(market: Market, listings: Listing[]) {
  const words = new Set(
    `${market.title} ${market.contracts.map((c) => c.label).join(" ")}`
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(
        (w) =>
          w.length > 3 &&
          ![
            "above",
            "below",
            "price",
            "will",
            "today",
            "this",
            "week",
            "year",
            "home",
            "away",
            "total",
            "points",
            "than",
            "more",
          ].includes(w),
      ),
  );
  return listings.filter((l) => {
    const name = `${l.player ?? ""} ${l.name}`.toLowerCase();
    return [...words].some((w) => name.split(/[^a-z]+/).includes(w));
  });
}

export const fundingStates = [
  "draft",
  "quote_ready",
  "awaiting_user_approval",
  "converting",
  "conversion_confirmed",
  "withdrawal_submitted",
  "withdrawal_pending",
  "received_on_solana",
  "checkout_ready",
  "held",
  "approval_pending",
  "unsupported",
  "failed",
  "cancelled",
  "refund_pending",
  "reconciliation_required",
] as const;
export type FundingState = (typeof fundingStates)[number];
const transitions: Partial<Record<FundingState, FundingState[]>> = {
  draft: ["quote_ready", "unsupported", "cancelled"],
  quote_ready: ["awaiting_user_approval", "cancelled"],
  awaiting_user_approval: [
    "converting",
    "cancelled",
    "held",
    "approval_pending",
  ],
  converting: ["conversion_confirmed", "failed", "reconciliation_required"],
  conversion_confirmed: [
    "withdrawal_submitted",
    "held",
    "cancelled",
    "approval_pending",
  ],
  approval_pending: ["withdrawal_submitted", "cancelled", "held"],
  withdrawal_submitted: [
    "withdrawal_pending",
    "failed",
    "reconciliation_required",
  ],
  withdrawal_pending: ["received_on_solana", "held", "reconciliation_required"],
  received_on_solana: ["checkout_ready", "reconciliation_required"],
  held: ["reconciliation_required", "cancelled"],
};
export function transitionFunding(from: FundingState, to: FundingState) {
  if (!transitions[from]?.includes(to))
    throw new Error(`Invalid funding transition ${from} -> ${to}`);
  return to;
}
export function fundingRoute(capabilities: {
  nativeSolana: boolean;
  cryptoSend: boolean;
  destinationApproved: boolean;
  conversion: boolean;
  evmWalletOwned: boolean;
  relayLiveQuote: boolean;
}) {
  if (
    !capabilities.cryptoSend ||
    !capabilities.conversion ||
    !capabilities.destinationApproved
  )
    return "manual" as const;
  if (capabilities.nativeSolana) return "direct_solana" as const;
  if (capabilities.evmWalletOwned && capabilities.relayLiveQuote)
    return "owned_evm_then_relay" as const;
  return "manual" as const;
}
export class IntegrationBlocked extends Error {
  constructor(
    public provider: string,
    public reason: string,
  ) {
    super(`${provider}: ${reason}`);
  }
}
