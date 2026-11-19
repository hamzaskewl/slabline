import { money, units, type Book, type Listing } from "./index";

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
  createdAt: string;
  resolution?: "yes" | "no" | "void";
  payout?: string;
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
};
export type DemoAccountView = {
  balance: string;
  positions: DemoPosition[];
  collectibles: DemoCollectible[];
};
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
