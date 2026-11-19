import {
  money,
  units,
  type DemoPosition,
  type DemoCollectible,
  type Listing,
  type GeminiSnapshot,
} from "./index";

export type ShareState = "open" | "won" | "lost" | "sold" | "void" | "pending";
export type ShareSlab = {
  source: "collectorcrypt" | "grail";
  sourceId: string;
  name: string;
  frontImage: string | null;
  player: string | null;
  year: string | null;
  set: string | null;
  grade: string | null;
  grader: string | null;
  role: "target" | "collected";
  observedAt: string | null;
};
export type ShareReference =
  | { source: "demo"; id: string }
  | {
      source: "gemini";
      symbol: string;
      outcome: string | null;
      settledAt: string | null;
      kind: "position" | "settlement";
    };
export type ShareSnapshot = {
  version: 1;
  capturedAt: string;
  environment: "production" | "sandbox" | "devnet" | "replay";
  state: ShareState;
  market: {
    eventTicker: string;
    symbol: string;
    title: string;
    selectedOutcome: string;
    side: "yes" | "no" | null;
    artwork: { src: string; label: string }[];
  };
  identity: {
    visible: boolean;
    displayName: string | null;
    addressLabel: string | null;
    avatarUrl: null;
  };
  trade: {
    currency: string;
    quantity: string | null;
    cost: string | null;
    averageEntryPrice: string | null;
    grossPayoutIfCorrect: string | null;
    finalGrossPayout: string | null;
    saleProceeds: string | null;
    fees: string | null;
    costIncludesFees: boolean | null;
    profit: string | null;
    roiPercent: string | null;
    profitBasis: "net" | "before-fees" | "unavailable";
    payoutReceipt: "not-applicable" | "unclaimed" | "pending" | "received";
  };
  slab: ShareSlab | null;
};
export const shareStateCopy = {
  open: {
    badge: "OPEN",
    headline: "Payout if correct",
    profit: "Potential profit",
  },
  won: { badge: "WON", headline: "Winning payout", profit: "Profit" },
  lost: { badge: "LOST", headline: "Final payout", profit: "Realized P/L" },
  sold: {
    badge: "CLOSED",
    headline: "Sale proceeds",
    profit: "Realized profit",
  },
  void: { badge: "REFUNDED", headline: "Refund", profit: "Realized P/L" },
  pending: { badge: "PENDING", headline: "Settlement pending", profit: "" },
} as const;

export function shareIdentity(
  visible: boolean,
  name?: string | null,
  wallet?: string | null,
): ShareSnapshot["identity"] {
  return {
    visible,
    displayName: visible ? name?.trim().slice(0, 70) || null : null,
    addressLabel:
      visible && !name?.trim() && wallet
        ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
        : null,
    avatarUrl: null,
  };
}
export const identityLabel = (s: ShareSnapshot) =>
  s.identity.visible
    ? s.identity.displayName || s.identity.addressLabel || "Trader"
    : "Anonymous";
export const signedMoney = (v: bigint) =>
  `${v < 0n ? "-" : ""}${money(v < 0n ? -v : v)}`;
function averagePrice(cost: string, quantity: string): string | null {
  if (units(quantity) === 0n) return null;
  const precision = 1_000_000_000_000n,
    price = (units(cost) * precision) / units(quantity);
  if (price === 0n && units(cost) > 0n) return null;
  return `${price / precision}.${(price % precision).toString().padStart(12, "0").replace(/0+$/, "").padEnd(6, "0")}`;
}
export function shareProfit(
  proceeds: string | null,
  cost: string | null,
  fees: string | null,
  costIncludesFees: boolean | null,
) {
  if (proceeds === null || cost === null)
    return {
      profit: null,
      roiPercent: null,
      profitBasis: "unavailable" as const,
    };
  const basis = units(cost),
    profit =
      units(proceeds) -
      basis -
      (costIncludesFees === false && fees !== null ? units(fees) : 0n);
  return {
    profit: signedMoney(profit),
    roiPercent:
      basis > 0n ? signedMoney((profit * 100n * 1_000_000n) / basis) : null,
    profitBasis:
      costIncludesFees === true || (costIncludesFees === false && fees !== null)
        ? ("net" as const)
        : ("before-fees" as const),
  };
}
export function slabFromListing(c: Listing): ShareSlab {
  return {
    source: "collectorcrypt",
    sourceId: c.mint,
    name: c.name,
    frontImage: c.frontImage,
    player: c.player,
    year: c.year,
    set: c.set,
    grade: c.grade,
    grader: c.grader,
    role: "target",
    observedAt: c.observedAt,
  };
}
export function demoShareSnapshot(
  p: DemoPosition,
  collectibles: DemoCollectible[],
  identity: ShareSnapshot["identity"],
  capturedAt: string,
): ShareSnapshot {
  const state: ShareState =
    p.state === "refunded"
      ? "void"
      : ["open", "won", "lost", "sold"].includes(p.state)
        ? (p.state as ShareState)
        : "pending";
  const received = collectibles.find(
    (c) =>
      c.rewardPositionId === p.id && c.state === "confirmed" && c.confirmedAt,
  );
  const slab: ShareSlab | null = received
    ? {
        ...(received.listing
          ? slabFromListing(received.listing)
          : {
              source: received.source,
              sourceId: received.sourceId,
              name: received.name,
              frontImage: received.image,
              player: null,
              year: null,
              set: null,
              grade: null,
              grader: null,
              observedAt: received.confirmedAt ?? null,
            }),
        role: "collected",
      }
    : (p.shareTarget ?? null);
  const proceeds =
    state === "open"
      ? p.quantity
      : state === "sold"
        ? (p.saleProceeds ?? null)
        : state === "pending"
          ? null
          : (p.payout ?? null);
  return {
    version: 1,
    capturedAt,
    environment: p.replay ? "replay" : "devnet",
    state,
    market: {
      eventTicker: p.eventTicker,
      symbol: p.symbol,
      title: p.eventTitle,
      selectedOutcome: p.label,
      side: p.side,
      artwork: (p.artwork ?? []).map((a) => ({ src: a.src, label: a.label })),
    },
    identity,
    trade: {
      currency: "Demo USD",
      quantity: p.quantity,
      cost: p.cost,
      averageEntryPrice: averagePrice(p.cost, p.quantity),
      grossPayoutIfCorrect: state === "open" ? p.quantity : null,
      finalGrossPayout: p.payout ?? null,
      saleProceeds: p.saleProceeds ?? null,
      fees: null,
      costIncludesFees: false,
      ...shareProfit(proceeds, p.cost, null, false),
      payoutReceipt: state === "won" ? "unclaimed" : "not-applicable",
    },
    slab,
  };
}

/** Exact string formatting; never coerce money through a binary float. */
export function shareNumber(
  value: string | null,
  minDecimals = 0,
  maxDecimals = 6,
): string {
  if (value === null) return "—";
  const [whole = "0", fraction = ""] = value.split(".");
  const digits = fraction
    .slice(0, maxDecimals)
    .replace(/0+$/, "")
    .padEnd(minDecimals, "0");
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (digits ? `.${digits}` : "")
  );
}
export const shareAmount = (s: ShareSnapshot) =>
  s.state === "open"
    ? s.trade.grossPayoutIfCorrect
    : s.state === "sold"
      ? s.trade.saleProceeds
      : s.trade.finalGrossPayout;
const exactDecimal = (v: string | null | undefined): string | null =>
  typeof v === "string" && /^\d+(\.\d{1,6})?$/.test(v) ? v : null;
export function shareFeeQualifier(t: ShareSnapshot["trade"]) {
  return t.profitBasis === "net"
    ? "Profit includes fees"
    : t.costIncludesFees === true
      ? "Cost includes fees"
      : "Fees excluded";
}
export function geminiShareFinancials(
  position: GeminiSnapshot["positions"][number] | null,
  settlement: GeminiSnapshot["settlements"][number] | null,
): Pick<ShareSnapshot, "state" | "trade"> {
  const quantity = exactDecimal(position?.quantity ?? settlement?.quantity),
    average = exactDecimal(position?.averageEntryPrice);
  // AvgPrice belongs to the current position slice. Historical costBasis includes prior
  // sell P/L adjustments; use it only when the provider explicitly reports zero realized P/L.
  const basis = position
    ? quantity && average
      ? money((units(quantity) * units(average)) / 1_000_000n)
      : null
    : exactDecimal(settlement?.realizedPnl) !== null &&
        units(settlement!.realizedPnl!) === 0n
      ? exactDecimal(settlement?.costBasis)
      : null;
  const side = settlement?.outcome?.toLowerCase(),
    resolution = settlement?.resolutionSide?.toLowerCase();
  const payout = exactDecimal(settlement?.payout);
  const state: ShareState = position
    ? position.resolutionSide ||
      ["settled", "invalid", "closed"].includes(
        position.context?.contractStatus ?? "",
      )
      ? "pending"
      : "open"
    : settlement?.context?.contractStatus === "invalid"
      ? "void"
      : (side === "yes" || side === "no") &&
          (resolution === "yes" || resolution === "no") &&
          payout !== null
        ? side === resolution
          ? "won"
          : "lost"
        : "pending";
  const multiplier = exactDecimal(position?.payoutPerShare);
  const conditional =
    state === "open" && quantity && multiplier
      ? money((units(quantity) * units(multiplier)) / 1_000_000n)
      : null;
  return {
    state,
    trade: {
      currency: "USD",
      quantity,
      cost: basis,
      averageEntryPrice: average,
      grossPayoutIfCorrect: conditional,
      finalGrossPayout: payout,
      saleProceeds: null,
      fees: null,
      costIncludesFees: null,
      ...shareProfit(
        state === "pending" ? null : state === "open" ? conditional : payout,
        basis,
        null,
        null,
      ),
      payoutReceipt:
        settlement?.settledAt &&
        Number.isFinite(Date.parse(settlement.settledAt)) &&
        payout !== null
          ? "received"
          : position
            ? "not-applicable"
            : "pending",
    },
  };
}
export const shareFilename = (s: ShareSnapshot) =>
  `slabline-${
    s.market.selectedOutcome
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 55) || "position"
  }-${s.state}.png`;
export function shareIntent(
  platform: "X" | "Telegram" | "WhatsApp",
  url: string,
  text: string,
) {
  const query = new URLSearchParams(
    platform === "WhatsApp" ? { text: `${text} ${url}` } : { url, text },
  );
  return `${platform === "X" ? "https://twitter.com/intent/tweet" : platform === "Telegram" ? "https://t.me/share/url" : "https://wa.me/"}?${query}`;
}
