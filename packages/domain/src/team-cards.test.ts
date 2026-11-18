import { expect, test } from "bun:test";
import {
  cardPlayer,
  cardTeam,
  relatedCards,
  rewardForPayout,
  selectedRewardTeam,
  teamCardMatch,
  type Listing,
  type Market,
} from "./index";

const card = (name: string, ask = "145", mint = name): Listing => ({
  id: mint,
  mint,
  name,
  ask,
  category: "Basketball",
  player: null,
  grade: "10",
  grader: "PSA",
  cert: null,
  year: "2023",
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
const outcome = (label: string, code: string): Market => ({
  id: "champion",
  title: label,
  category: "Sports",
  subcategory: "Pro Basketball",
  status: "active",
  imageUrl: null,
  description: "",
  closesAt: null,
  children: [],
  contracts: [
    {
      symbol: `GEMI-NBAF-2627CHAMP-${code}`,
      label,
      status: "active",
      lastPrice: null,
      quantityIncrement: "1",
      priceIncrement: "0.01",
    },
  ],
});

test("NBA futures match the selected team, including verified alumni, without mixing opponents", () => {
  const sas = outcome("San Antonio", "SAS"),
    phi = outcome("Philadelphia", "PHI");
  const inventory = [
    card("2023 Victor Wembanyama Hoops"),
    card("1998 Tim Duncan"),
    card("2003 Allen Iverson"),
    card("2024 Random Person"),
  ];
  expect(relatedCards(sas, inventory).map(cardPlayer)).toEqual([
    "Victor Wembanyama",
    "Tim Duncan",
  ]);
  expect(relatedCards(phi, inventory).map(cardPlayer)).toEqual([
    "Allen Iverson",
  ]);
  expect(selectedRewardTeam(outcome("Oklahoma City", "OKC"))?.name).toBe(
    "Oklahoma City Thunder",
  );
  expect(
    teamCardMatch(outcome("Los Angeles L", "LAL"), card("1996 Kobe Bryant"))
      ?.player,
  ).toBe("Kobe Bryant");
  expect(selectedRewardTeam(outcome("LA Clippers", "LAC"))?.name).toBe(
    "LA Clippers",
  );
  expect(
    teamCardMatch(outcome("Philadelphia", "SAS"), inventory[0]!),
  ).toBeNull();
  const college = outcome("San Antonio", "SAS");
  college.contracts[0]!.symbol = "GEMI-NCAAB-TEST-SAS";
  expect(teamCardMatch(college, inventory[0]!)).toBeNull();
  expect(
    selectedRewardTeam({
      ...sas,
      contracts: [...sas.contracts, ...phi.contracts],
    }),
  ).toBeNull();
});

test("team history never invents the team depicted on a draft or unidentified card", () => {
  const draft = card(
    "2023 Victor Wembanyama Prizm Draft Picks",
    "299",
    "7pBafZNN98pZi4xis6kdDZ79iMWgSC8xTYAEWpXy6y5P",
  );
  expect(teamCardMatch(outcome("San Antonio", "SAS"), draft)?.basis).toBe(
    "history",
  );
  expect(cardTeam(draft)).toBeNull();
  const hoops = card(
    "2023 Victor Wembanyama Hoops",
    "145",
    "35yegtSwqDj1veo5Axqv8xcRNvYHnGJV4QtsLcH9xdqB",
  );
  expect(cardTeam(hoops)).toBe("San Antonio Spurs");
  expect(teamCardMatch(outcome("San Antonio", "SAS"), hoops)?.basis).toBe(
    "card",
  );
  expect(cardPlayer(card("Unknown surname-only card"))).toBeNull();
});

test("manual card choice survives stake changes; auto match recovers when a listing disappears", () => {
  const cards = [
    card("Hoops", "145"),
    card("Chrome", "250"),
    card("Draft", "299"),
  ];
  expect(rewardForPayout(cards, "270").card?.name).toBe("Chrome");
  expect(rewardForPayout(cards, "270", "Hoops").card?.name).toBe("Hoops");
  expect(rewardForPayout(cards, "100", "Draft").covered).toBe(false);
  expect(rewardForPayout(cards, "350", "Draft").covered).toBe(true);
  expect(rewardForPayout(cards, "270", "sold-listing").card?.name).toBe(
    "Chrome",
  );
});
