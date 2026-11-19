import { expect, test } from "bun:test";
import {
  rewardAllocation,
  demoSaleQuote,
  demoSalePreview,
  DEMO_REPLAY,
  DEMO_REPLAY_CARD,
  activeDemoPosition,
  demoPositionContext,
  positionRewardMarket,
  demoCollectibleValue,
} from "./demo";
import { matchingCards, type Market } from "./index";
test("reward selections allow any card spend and unrestricted extra funds", () => {
  expect(rewardAllocation("100", ["10"]).valid).toBe(true);
  expect(rewardAllocation("100", ["10"]).remainder).toBe("90.000000");
  expect(rewardAllocation("100", ["100"]).remainder).toBe("0.000000");
  expect(rewardAllocation("100", ["100.000001"]).topUp).toBe("0.000001");
  expect(rewardAllocation("100", ["1000"]).valid).toBe(true);
  expect(rewardAllocation("100", ["1000"]).additionalTopUp).toBe("900.000000");
  expect(rewardAllocation("100", ["81"], "5").remainder).toBe("24.000000");
  expect(rewardAllocation("100", ["101"], "2").additionalTopUp).toBe(
    "0.000000",
  );
  expect(() => rewardAllocation("100", ["-1", "101"])).toThrow();
  expect(rewardAllocation("0.000001", ["0.000001"]).valid).toBe(true);
  expect(rewardAllocation("0.000001", []).valid).toBe(false);
  expect(rewardAllocation("0", []).valid).toBe(false);
});
test("portfolio includes wallet contributions only after card delivery", () => {
  expect(
    demoCollectibleValue({ cost: "105", topUp: "5", state: "reserved" }),
  ).toBe(100_000_000n);
  expect(
    demoCollectibleValue({ cost: "105", topUp: "5", state: "confirmed" }),
  ).toBe(105_000_000n);
  expect(demoCollectibleValue({ cost: "80", state: "reserved" })).toBe(
    80_000_000n,
  );
});
test("sales use bids for the selected side and reject unavailable depth", () => {
  expect(demoSaleQuote({ side: "yes", quantity: "10" }, DEMO_REPLAY.book)).toBe(
    "1.900000",
  );
  expect(demoSaleQuote({ side: "no", quantity: "3" }, DEMO_REPLAY.book)).toBe(
    "2.280000",
  );
  expect(() =>
    demoSaleQuote({ side: "yes", quantity: "100000" }, DEMO_REPLAY.book),
  ).toThrow("Not enough buyers");
});

test("sale previews cap oversized requests to holdings and available buyers", () => {
  const book = {
    ...DEMO_REPLAY.book,
    bids: [
      { price: "0.20", quantity: "100" },
      { price: "0.10", quantity: "150" },
    ],
  };
  expect(
    demoSalePreview({ side: "yes", quantity: "225" }, book, "999"),
  ).toEqual({
    maximum: "225.000000",
    quantity: "225.000000",
    proceeds: "32.500000",
  });
  expect(demoSalePreview({ side: "yes", quantity: "300" }, book)).toEqual({
    maximum: "250.000000",
    quantity: "250.000000",
    proceeds: "35.000000",
  });
  expect(
    demoSalePreview({ side: "yes", quantity: "300" }, book, "25").proceeds,
  ).toBe("5.000000");
  const thinner = { ...book, bids: [{ price: "0.20", quantity: "80" }] };
  expect(
    demoSalePreview({ side: "yes", quantity: "300" }, thinner, "250"),
  ).toEqual({
    maximum: "80.000000",
    quantity: "80.000000",
    proceeds: "16.000000",
  });
  // Execution remains strict if depth changes after the displayed quote.
  expect(() =>
    demoSaleQuote({ side: "yes", quantity: "250" }, thinner),
  ).toThrow("Not enough buyers");
});

test("sale capacity uses NO bids, floors each level to its lot and handles no buyers", () => {
  const book = {
    ...DEMO_REPLAY.book,
    quantityIncrement: "0.25",
    asks: [
      { price: "0.60", quantity: "1.49" },
      { price: "0.80", quantity: "1.49" },
      { price: "1", quantity: "900" },
    ],
  };
  expect(demoSalePreview({ side: "no", quantity: "5" }, book, "100")).toEqual({
    maximum: "2.500000",
    quantity: "2.500000",
    proceeds: "0.750000",
  });
  expect(
    demoSalePreview({ side: "no", quantity: "5" }, book, "1.49").quantity,
  ).toBe("1.250000");
  expect(
    demoSalePreview({ side: "yes", quantity: "225" }, { ...book, bids: [] }),
  ).toEqual({
    maximum: "0.000000",
    quantity: "0.000000",
    proceeds: null,
  });
  expect(
    demoSalePreview({ side: "yes", quantity: "0" }, DEMO_REPLAY.book).proceeds,
  ).toBeNull();
});

test("winning positions stay active until their reward is fully claimed", () => {
  const reward = {
    budget: "100",
    cardSpend: "80",
    remainder: "20",
    state: "available" as const,
  };
  expect(activeDemoPosition({ state: "open" })).toBe(true);
  expect(activeDemoPosition({ state: "won" })).toBe(true);
  expect(activeDemoPosition({ state: "won", reward })).toBe(true);
  expect(
    activeDemoPosition({
      state: "won",
      reward: { ...reward, state: "allocated" },
    }),
  ).toBe(true);
  expect(
    activeDemoPosition({
      state: "won",
      reward: { ...reward, state: "claimed" },
    }),
  ).toBe(false);
  for (const state of ["sold", "lost", "refunded"])
    expect(activeDemoPosition({ state })).toBe(false);
});

test("saved and legacy rewards match the settled selected team, never sibling outcomes", () => {
  const contract = {
    symbol: DEMO_REPLAY.book.symbol,
    label: DEMO_REPLAY.label,
    status: "settled",
    imageUrl: DEMO_REPLAY.artwork[0]!.src,
    lastPrice: "1",
    quantityIncrement: "1",
    priceIncrement: "0.01",
  };
  const other = {
    ...contract,
    symbol: "GEMI-NBAF-2627CHAMP-PHI",
    label: "Philadelphia",
    imageUrl: "https://example.com/phi.png",
  };
  const market: Market = {
    id: DEMO_REPLAY.eventTicker,
    title: "San Antonio or Philadelphia champion",
    category: "Sports",
    status: "settled",
    description: "Philadelphia",
    searchText: "Philadelphia",
    imageUrl: null,
    closesAt: null,
    contracts: [contract, other],
    children: [],
  };
  market.children = [
    { ...market, title: "Philadelphia", contracts: [other], children: [] },
  ];
  const saved = demoPositionContext(market, contract);
  expect(saved.artwork).toEqual(DEMO_REPLAY.artwork);
  expect(saved.rewardMarket.contracts).toEqual([contract]);
  expect(saved.rewardMarket.children).toEqual([]);
  const inventory = [
    DEMO_REPLAY_CARD,
    {
      ...DEMO_REPLAY_CARD,
      mint: "opponent",
      name: "2003 Allen Iverson",
      player: "Allen Iverson",
      team: "Philadelphia 76ers",
    },
  ];
  const position = {
    eventTicker: market.id,
    eventTitle: market.title,
    symbol: contract.symbol,
    label: contract.label,
  };
  expect(
    matchingCards(positionRewardMarket({ ...position, ...saved }), inventory),
  ).toEqual([DEMO_REPLAY_CARD]);
  expect(matchingCards(positionRewardMarket(position), inventory)).toEqual([
    DEMO_REPLAY_CARD,
  ]);
  expect(
    matchingCards(positionRewardMarket(position), inventory.slice(1)),
  ).toEqual([]);
});

test("binary positions retain their event subject and supplied artwork", () => {
  const contract = {
    symbol: "GEMI-WEMBY-YES",
    label: "Yes",
    status: "active",
    lastPrice: null,
    quantityIncrement: "1",
    priceIncrement: "0.01",
  };
  const market: Market = {
    id: "wemby",
    title: "Will Victor Wembanyama win MVP?",
    category: "Sports",
    status: "active",
    description: "",
    imageUrl: "https://example.com/wemby.png",
    closesAt: null,
    contracts: [contract],
    children: [],
  };
  const context = demoPositionContext(market, contract);
  expect(context.artwork).toEqual([
    { src: market.imageUrl!, label: market.title },
  ]);
  expect(matchingCards(context.rewardMarket, [DEMO_REPLAY_CARD])).toEqual([
    DEMO_REPLAY_CARD,
  ]);
});
