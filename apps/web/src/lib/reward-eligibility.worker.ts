import {
  eligibleTokens,
  type GrailToken,
  type Listing,
  type Market,
} from "@collectible/domain";
import { eligibleRewardCards } from "./eligible-reward-cards";

self.onmessage = (
  event: MessageEvent<{
    cards: Listing[];
    tokens: GrailToken[];
    markets: Market[];
  }>,
) => {
  const { cards, tokens, markets } = event.data;
  self.postMessage({
    cards: eligibleRewardCards(cards, markets),
    tokens: eligibleTokens(tokens, markets),
  });
};
