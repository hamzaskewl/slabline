import { expect, test } from "bun:test";
import {
  DEMO_REPLAY,
  DEMO_REPLAY_CARD,
  type Market,
} from "@collectible/domain";
import { hasListedCards } from "./card-availability";

test("card availability follows the selected team and excludes missing prices", () => {
  const spurs = {
    symbol: "GEMI-NBAF-2627CHAMP-SAS",
    label: "San Antonio",
    status: "open",
    lastPrice: null,
    quantityIncrement: "1",
    priceIncrement: "0.01",
  };
  const lakers = {
    ...spurs,
    symbol: "GEMI-NBAF-2627CHAMP-LAL",
    label: "Los Angeles Lakers",
  };
  const market: Market = {
    id: "nba",
    title: DEMO_REPLAY.eventTitle,
    category: "Sports",
    status: "active",
    imageUrl: null,
    description: "",
    closesAt: null,
    children: [],
    contracts: [spurs, lakers],
  };
  expect(hasListedCards(market, [DEMO_REPLAY_CARD])).toBe(true);
  expect(hasListedCards(market, [DEMO_REPLAY_CARD], spurs)).toBe(true);
  expect(hasListedCards(market, [DEMO_REPLAY_CARD], lakers)).toBe(false);
  expect(hasListedCards(market, [])).toBe(false);
  expect(hasListedCards(market, [{ ...DEMO_REPLAY_CARD, ask: "0" }])).toBe(
    false,
  );
});
