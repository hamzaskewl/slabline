import {
  matchingCards,
  outcomeRewardMarket,
  marketOutcomes,
  type Contract,
  type Listing,
  type Market,
} from "@collectible/domain";

export function hasListedCards(
  market: Market,
  cards: Listing[],
  outcome?: Contract,
) {
  const listed = cards.filter(
    (card) => Number.isFinite(Number(card.ask)) && Number(card.ask) > 0,
  );
  if (!listed.length) return false;
  if (outcome)
    return (
      matchingCards(outcomeRewardMarket(market, outcome), listed).length > 0
    );
  return (
    matchingCards(market, listed).length > 0 ||
    marketOutcomes(market).some(
      (contract) =>
        matchingCards(outcomeRewardMarket(market, contract), listed).length > 0,
    )
  );
}
