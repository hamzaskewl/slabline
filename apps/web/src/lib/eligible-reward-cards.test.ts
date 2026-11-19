import { expect, test } from "bun:test";
import { eligibleCards, type Listing, type Market } from "@collectible/domain";
import { PRACTICE_MARKET } from "@collectible/integrations/fixtures";
import { eligibleRewardCards } from "./eligible-reward-cards";

const card = (name: string, category: string): Listing => ({
  id: name,
  mint: name,
  name,
  category,
  ask: "100",
  player: null,
  grade: "10",
  grader: "PSA",
  cert: null,
  year: "2024",
  set: null,
  frontImage: null,
  backImage: null,
  currency: "USDC",
  seller: null,
  network: "mainnet",
  source: "collectorcrypt",
  observedAt: "2026-11-18T00:00:00Z",
  valuation: null,
});
const event = (title: string, status = "active"): Market => ({
  ...PRACTICE_MARKET,
  title,
  status,
  contracts: [],
  category: "Other",
});

test("batched reward eligibility preserves domain rules, identity and inventory order", () => {
  const cards = [
    card("Pikachu", "Pokemon"),
    card("Michael Jordan", "Basketball"),
    card("Elon Musk", "Non-Sport"),
    card("Chocobo", "Non-Sport"),
  ];
  // Provider duplicates may share a mint; eligibility must keep both entries.
  cards.push({ ...cards[0]!, id: "another listing", ask: "200" });
  for (const markets of [
    [],
    [event("Pokémon prices", "closed")],
    [event("Tesla earnings")],
    [{ ...event("Collectible prices"), children: [event("Pokémon prices")] }],
  ]) {
    expect(eligibleRewardCards(cards, markets)).toEqual(
      eligibleCards(cards, markets),
    );
  }
  expect(
    eligibleRewardCards(cards, [event("Tesla earnings")]).map((c) => c.name),
  ).toEqual(["Michael Jordan", "Elon Musk"]);
});
