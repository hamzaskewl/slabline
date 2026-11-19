import { units, money, type Listing, type Valuation } from "./index";

/** Inputs must already be matched to the selected outcome, never the whole event. */
export function rewardForPayout(
  cards: Listing[],
  payout: string | null,
  preferredMint?: string | null,
) {
  const sorted = cards
    .filter((c) => c.currency === "USDC" && units(c.ask) > 0n)
    .sort((a, b) =>
      units(a.ask) < units(b.ask)
        ? -1
        : units(a.ask) > units(b.ask)
          ? 1
          : a.mint.localeCompare(b.mint),
    );
  const budget = payout === null ? null : units(payout);
  const affordable =
    budget === null ? [] : sorted.filter((c) => units(c.ask) <= budget);
  const card =
    sorted.find((c) => c.mint === preferredMint) ??
    affordable.at(-1) ??
    sorted[0] ??
    null;
  const next = card
    ? (sorted.find((c) => units(c.ask) > units(card.ask)) ?? null)
    : null;
  return {
    card,
    next,
    covered: !!card && budget !== null && units(card.ask) <= budget,
  };
}

export type GrailRewardDetails = {
  tokenId: string;
  priceUsd: string | null;
  observedAt: string;
  lastTradeAt: string | null;
  history: { time: number; price: number; volume: number }[];
  reserves: {
    id: string;
    name: string;
    image: string | null;
    tokensPerItem: string;
    vaulted: number;
    available: number;
    valuation?: Valuation | null;
  }[];
};

/** Indicative spot-price comparison only; never an executable swap quote. */
export function indicativeTokens(
  payout: string | null,
  price: string | null,
): string | null {
  if (payout === null || price === null || !/^\d+(\.\d{1,12})?$/.test(price))
    return null;
  const [whole, fraction = ""] = price.split(".");
  const priceUnits =
    BigInt(whole!) * 10n ** 12n + BigInt(fraction.padEnd(12, "0"));
  if (priceUnits <= 0n) return null;
  return money((units(payout) * 10n ** 12n) / priceUnits);
}
