import { z } from "zod";
export * from "./history";
export * from "./rewards";
export * from "./evm";
export * from "./relay";
export * from "./collector-crypt";
export * from "./orderbook";
export * from "./reward-preview";
export * from "./discovery";
export * from "./team-cards";
export * from "./demo";
import { marketSearchText, marketTeams } from "./discovery";
import { relatedCards } from "./rewards";

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
  color?: string | null;
  imageUrl?: string | null;
  buyYes?: string | null;
  buyNo?: string | null;
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
  volume?: string | null;
  startsAt?: string | null;
  subcategory?: string | null;
  sportsMarket?: { type: string; subject?: string; sport?: string } | null;
  teams?: Contract[];
  status: string;
  imageUrl: string | null;
  contracts: Contract[];
  children: Market[];
  description: string;
  closesAt: string | null;
  // Discovery responses carry a compact preview; full outcomes remain on /market.
  outcomeCount?: number;
  searchText?: string;
};
const palette = [
  "#0f9ee7",
  "#005cf0",
  "#fb6832",
  "#b184f4",
  "#40b77a",
  "#edb544",
];
export function marketOutcomes(market: Market) {
  const seen = new Set<string>();
  const colors = new Set<string>();
  function visit(m: Market, nested: boolean): (Contract & { color: string })[] {
    const rows = m.contracts.flatMap((c) => {
      if (seen.has(c.symbol)) return [];
      const preferred =
        c.color && /^#[a-f\d]{6}$/i.test(c.color)
          ? c.color.toLowerCase()
          : null;
      const color =
        preferred && !colors.has(preferred)
          ? preferred
          : (palette.find((p) => !colors.has(p)) ??
            `hsl(${Math.round((seen.size * 137.5) % 360)}, 76%, 63%)`);
      colors.add(color);
      seen.add(c.symbol);
      return [
        {
          ...c,
          label: nested
            ? c.label.toLowerCase() === "yes"
              ? m.title
              : m.title + " · " + c.label
            : c.label,
          color,
        },
      ];
    });
    return [...rows, ...m.children.flatMap((child) => visit(child, true))];
  }
  return visit(market, false);
}
export function buyPercent(value?: string | null) {
  return value != null && /^\d+(?:\.\d+)?$/.test(value) && Number(value) <= 1
    ? new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(Number(value))
    : "—";
}
export function eventVolume(value?: string | null) {
  return value != null &&
    /^\d+(?:\.\d+)?$/.test(value) &&
    Number.isFinite(Number(value))
    ? "$" +
        Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 }) +
        " vol."
    : "Volume unavailable";
}
export function marketPreview(market: Market): Market {
  const contracts = marketOutcomes(market);
  return {
    ...market,
    description: "",
    contracts: contracts.slice(0, 2),
    teams: marketTeams(market),
    children: [],
    outcomeCount: contracts.length,
    searchText: marketSearchText(market),
  };
}
export type Listing = {
  id: string;
  mint: string;
  name: string;
  category: string;
  player: string | null;
  team?: string | null;
  teamSource?: string | null;
  autographed?: boolean;
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
  source: "live" | "cache" | "fixture" | "unavailable";
  observedAt: string;
  error: string | null;
  refreshing?: boolean;
  stale?: boolean;
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
  team: z.string().max(100).nullable().optional(),
  teamSource: z.string().url().nullable().optional(),
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
    notional = 0n,
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
    notional += level.price * q;
    fills.push({ price: money(level.price), quantity: money(q) });
    if (q < level.quantity - (level.quantity % lot)) break;
  }
  if (quantity < quantityMinimum)
    return {
      contracts: money(0n),
      averagePrice: null,
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
    // Weighted execution price excludes fees and per-fill cash rounding.
    averagePrice: quantity
      ? money((notional + quantity / 2n) / quantity)
      : null,
    cost: money(cost),
    fees: input.feeBps === null ? null : money(fees),
    totalPayout: money(quantity),
    unspent: money(remaining),
    feesVerified: input.feeBps !== null,
    fills,
    exhausted:
      quantity > 0n &&
      quantity ===
        levels.reduce((sum, level) => sum + (level.quantity / lot) * lot, 0n) &&
      remaining > 0n,
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
export const matchingCards = relatedCards;

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
export * from "./accounts";
export * from "./position-share";
