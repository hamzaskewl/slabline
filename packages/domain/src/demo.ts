import {
  money,
  units,
  bookForSide,
  outcomeRewardMarket,
  outcomeImages,
  type Market,
  type Contract,
  type Book,
  type Listing,
  type Valuation,
} from "./index";

export const DEMO_REPLAY_CARD: Listing = {
  id: "2026081413C224241",
  mint: "35yegtSwqDj1veo5Axqv8xcRNvYHnGJV4QtsLcH9xdqB",
  name: "2023 #298 Victor Wembanyama PSA 10 Panini NBA Hoops",
  category: "Basketball",
  player: "Victor Wembanyama",
  team: "San Antonio Spurs",
  grade: "GEM-MT 10",
  grader: "PSA",
  cert: "94589048",
  year: "2023",
  set: "Panini NBA Hoops",
  ask: "145",
  currency: "USDC",
  frontImage: "/demo/wembanyama-hoops.jpg",
  backImage: null,
  seller: null,
  network: "mainnet",
  source: "collectorcrypt",
  observedAt: "2026-11-19T00:45:44.361Z",
  valuation: null,
};

export type DemoPosition = {
  id: string;
  state: string;
  eventTicker: string;
  eventTitle: string;
  symbol: string;
  label: string;
  side: "yes" | "no";
  quantity: string;
  cost: string;
  replay: boolean;
  rehearsal?: "grail";
  soldQuantity?: string;
  realizedCost?: string;
  grailHolding?: {
    symbol: string;
    quantity: string;
    cost: string;
    priceUsd: string;
    purchasedAt: string;
  };
  createdAt: string;
  rewardMarket?: Market;
  artwork?: { src: string; label: string }[];
  shareTarget?: import("./position-share").ShareSlab;
  resolution?: "yes" | "no" | "void";
  payout?: string;
  settledAt?: string;
  soldAt?: string;
  saleProceeds?: string;
  reward?: {
    budget: string;
    state: "available" | "allocated" | "claimed";
    cardSpend: string;
    remainder: string;
    topUp?: string;
    delivery?: "cash" | "grail";
  };
};
export type DemoCollectible = {
  id: string;
  state: string;
  name: string;
  image: string | null;
  source: "collectorcrypt" | "grail";
  sourceId: string;
  sourceUrl: string;
  cost: string;
  wallet: string;
  mint?: string;
  signature?: string;
  unsignedBase64?: string;
  rewardPositionId?: string;
  topUp?: string;
  paymentConfirmedAt?: string;
  valuation?: Valuation | null;
  listing?: Listing;
  confirmedAt?: string;
};
export type DemoAccountView = {
  balance: string;
  positions: DemoPosition[];
  collectibles: DemoCollectible[];
  history?: { time: string; value: string }[];
};

export const activeDemoPosition = (p: Pick<DemoPosition, "state" | "reward">) =>
  p.state === "open" || (p.state === "won" && p.reward?.state !== "claimed");

/** Keep the selected subject when a market later settles or leaves discovery. */
export function demoPositionContext(market: Market, contract: Contract) {
  const artwork = outcomeImages(market, contract);
  return {
    rewardMarket: outcomeRewardMarket(market, contract),
    artwork: artwork.length
      ? artwork
      : market.contracts.length === 1 && market.imageUrl
        ? [{ src: market.imageUrl, label: market.title }]
        : [],
  };
}
export function positionRewardMarket(
  p: Pick<
    DemoPosition,
    "rewardMarket" | "eventTicker" | "eventTitle" | "symbol" | "label"
  >,
): Market {
  if (p.rewardMarket) return p.rewardMarket;
  const label = /^(yes|no)$/i.test(p.label) ? p.eventTitle : p.label;
  return {
    id: p.eventTicker,
    title: label,
    category: "",
    status: "settled",
    imageUrl: null,
    description: "",
    closesAt: null,
    children: [],
    contracts: [
      {
        symbol: p.symbol,
        label,
        status: "settled",
        lastPrice: null,
        quantityIncrement: null,
        priceIncrement: null,
      },
    ],
  };
}

/** The minimum rounds UP to the smallest USDC unit, never below 80%. */
export function rewardAllocation(
  budget: string,
  costs: string[],
  committedTopUp = "0",
) {
  const cap = units(budget),
    total = costs.reduce((sum, cost) => sum + units(cost), 0n);
  const minimum = (cap * 80n + 99n) / 100n;
  const maxTopUp = cap / 20n,
    maximum = cap + maxTopUp;
  const committed = units(committedTopUp);
  const needed = total > cap ? total - cap : 0n;
  const topUp = needed > committed ? needed : committed;
  const funded = total - topUp;
  return {
    total: money(total),
    minimum: money(minimum),
    maximum: money(maximum),
    maxTopUp: money(maxTopUp),
    topUp: money(topUp),
    additionalTopUp: money(topUp - committed),
    remainder: money(cap > funded ? cap - funded : 0n),
    valid:
      cap > 0n &&
      funded >= minimum &&
      total <= maximum &&
      committed >= 0n &&
      topUp <= maxTopUp &&
      costs.every((c) => units(c) > 0n),
    overBudget: total > maximum || topUp > maxTopUp,
  };
}

/** Pending wallet money is not portfolio value until its atomic transfer lands. */
export function demoCollectibleValue(
  card: Pick<DemoCollectible, "cost" | "topUp" | "state">,
) {
  return (
    units(card.cost) -
    (card.state === "confirmed" ? 0n : units(card.topUp ?? "0"))
  );
}

/** Size a sale to the holding and executable selected-side bid depth. */
export function demoSalePreview(
  position: Pick<DemoPosition, "side" | "quantity">,
  book: Book,
  requested = position.quantity,
) {
  const lot = units(book.quantityIncrement);
  if (lot <= 0n) throw new Error("Invalid share increment.");
  const depth = bookForSide(book, position.side).bids.reduce(
    (total, level) =>
      total +
      (units(level.price) > 0n ? (units(level.quantity) / lot) * lot : 0n),
    0n,
  );
  const held = (units(position.quantity) / lot) * lot;
  const maximum = held < depth ? held : depth;
  const wanted = (units(requested) / lot) * lot;
  const quantity = money(wanted < maximum ? wanted : maximum);
  return {
    maximum: money(maximum),
    quantity,
    proceeds:
      units(quantity) > 0n
        ? demoSaleQuote({ side: position.side, quantity }, book)
        : null,
  };
}

/** A full-position sale uses executable bids, never the last-traded price. */
export function demoSaleQuote(
  position: Pick<DemoPosition, "side" | "quantity">,
  book: Book,
) {
  let remaining = units(position.quantity),
    proceeds = 0n;
  const lot = units(book.quantityIncrement);
  if (lot <= 0n || remaining <= 0n || remaining % lot)
    throw new Error("Invalid share quantity.");
  for (const level of [...bookForSide(book, position.side).bids].sort(
    (a, b) => Number(b.price) - Number(a.price),
  )) {
    const available = (units(level.quantity) / lot) * lot;
    const quantity = remaining < available ? remaining : available;
    proceeds += (quantity * units(level.price)) / 1_000_000n;
    remaining -= quantity;
    if (!remaining) break;
  }
  if (remaining)
    throw new Error(
      "Not enough buyers to sell all shares. Try again when more bids are available.",
    );
  const precision = book.quoteAssetPrecision ?? 6;
  const cashUnit = 10n ** BigInt(6 - precision);
  return money((proceeds / cashUnit) * cashUnit);
}
export function demoPayout(
  position: Pick<DemoPosition, "quantity" | "cost" | "side">,
  resolution: "yes" | "no" | "void",
) {
  return resolution === "void"
    ? position.cost
    : resolution === position.side
      ? money(units(position.quantity))
      : "0.000000";
}

// Recorded public Gemini depth, 2026-11-18 America/Chicago. Replay orders never
// claim live execution and can be completed independently of a game's schedule.
export const DEMO_REPLAY = {
  eventTicker: "NBAF-2627CHAMP",
  eventTitle: "2027 Pro Basketball Champion",
  label: "San Antonio",
  artwork: [
    {
      src: "https://assets.gemini.com/predictions/images/SAS_2eb39eb7-ca58-4ad8-b58d-36add7053fe6.png",
      label: "San Antonio",
    },
  ],
  book: {
    symbol: "GEMI-NBAF-2627CHAMP-SAS",
    bids: [
      { price: "0.19", quantity: "50" },
      { price: "0.14", quantity: "2857" },
    ],
    asks: [
      { price: "0.24", quantity: "3" },
      { price: "0.25", quantity: "50" },
      { price: "0.29", quantity: "563" },
    ],
    updatedAt: "2026-11-19T00:45:44.361Z",
    stale: false,
    source: "gemini",
    quantityIncrement: "1",
    quantityMinimum: "1",
    priceIncrement: "0.01",
    priceMinimum: "0.01",
    quoteAssetPrecision: 2,
  } satisfies Book,
};

/** Never infer a result from prices, event closure, a clock or a score. */
export function explicitResolution(
  raw: unknown,
  symbol: string,
): "yes" | "no" | "void" | null {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as { contracts?: unknown[]; events?: unknown[] };
  for (const row of event.contracts ?? []) {
    if (!row || typeof row !== "object") continue;
    const c = row as Record<string, unknown>;
    if (c.instrumentSymbol !== symbol) continue;
    if (c.status === "invalid") return "void";
    if (
      c.status === "settled" &&
      typeof c.resolvedAt === "string" &&
      Number.isFinite(Date.parse(c.resolvedAt))
    ) {
      if (c.resolutionSide === "yes" || c.resolutionSide === "no")
        return c.resolutionSide;
    }
  }
  for (const child of event.events ?? []) {
    const result = explicitResolution(child, symbol);
    if (result) return result;
  }
  return null;
}

// Archived public Grail quote for a repeatable rehearsal. No live swap is claimed.
export const DEMO_GRAIL = {
  symbol: "JENSEN",
  name: "Jensen Huang",
  chainId: 4663,
  address: "0xa6b0e654bdefc8cff8e9b0c90388768be404d921",
  priceUsd: "0.000239255317",
  image:
    "https://grailxyz-public.s3.us-east-2.amazonaws.com/images/cdac69a6-2a10-42fd-9285-c79fc33b6bfe.webp",
  url: "https://grail.xyz/trade/jensen",
  observedOn: "2026-11-19",
  slabSearchUrl:
    "https://api.collectorcrypt.com/marketplace?step=100&marketplaceSource=CC&orderBy=listedPriceDesc&search=Jensen",
  matchingSlabs: 0,
};
// Actual archived Gemini event identity; depth is explicitly illustrative.
// The catalog check above returned zero rows with no next cursor.
export const DEMO_GRAIL_REPLAY = {
  eventTicker: "NVDA260225",
  eventTitle: "What will NVIDIA say on next earnings call?",
  label: "Omniverse",
  artwork: [{ src: DEMO_GRAIL.image, label: DEMO_GRAIL.name }],
  book: {
    ...DEMO_REPLAY.book,
    symbol: "GEMI-NVDA260225-OMNIVERSE",
    asks: [{ price: "0.25", quantity: "10000" }],
    bids: [{ price: "0.20", quantity: "10000" }],
    source: "fixture",
    updatedAt: "2026-11-19T07:14:55.000Z",
  } satisfies Book,
};
export function demoGrailQuantity(budget: string) {
  return money(
    (units(budget) * 10n ** 12n) / BigInt(DEMO_GRAIL.priceUsd.replace(".", "")),
  );
}
