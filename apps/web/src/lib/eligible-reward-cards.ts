import {
  activeMarket,
  relatedCards,
  sportCategories,
  type Listing,
  type Market,
} from "@collectible/domain";

// Evaluate each event once against the remaining non-sports inventory. Calling
// eligibleCards on the full catalog repeatedly reparses every event per card.
export function eligibleRewardCards(cards: Listing[], markets: Market[]) {
  let remaining = cards.filter(
    (card) => !sportCategories.includes(card.category),
  );
  const eligible = new Set<Listing>(
    cards.filter((card) => sportCategories.includes(card.category)),
  );
  for (const market of markets) {
    if (!remaining.length) break;
    if (!activeMarket(market)) continue;
    for (const card of relatedCards(market, remaining)) eligible.add(card);
    remaining = remaining.filter((card) => !eligible.has(card));
  }
  return cards.filter((card) => eligible.has(card));
}
