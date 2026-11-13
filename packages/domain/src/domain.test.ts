import { describe, expect, test } from "bun:test";
import {
  asksForSide,
  fundingRoute,
  quoteDepth,
  transitionFunding,
  units,
  money,
  validateCart,
  transitionPurchase,
  assertFreshListing,
} from "./index";

describe("exact depth quotes", () => {
  test("walks asks, fees and partial depth without float drift", () => {
    const q = quoteDepth({
      stake: "10",
      quantityIncrement: "1",
      feeBps: 100,
      asks: [
        { price: "0.40", quantity: "10" },
        { price: "0.50", quantity: "100" },
      ],
    });
    expect(q.contracts).toBe("21.000000");
    expect(q.cost).toBe("9.500000");
    expect(q.fees).toBe("0.095000");
    expect(q.unspent).toBe("0.405000");
  });
  test("fractional increments and minimum lot", () => {
    expect(
      quoteDepth({
        stake: "0.01",
        quantityIncrement: "1",
        feeBps: 0,
        asks: [{ price: "0.5", quantity: "1" }],
      }).contracts,
    ).toBe("0.000000");
    expect(
      quoteDepth({
        stake: "0.15",
        quantityIncrement: "0.1",
        feeBps: 0,
        asks: [{ price: "0.5", quantity: "1" }],
      }).contracts,
    ).toBe("0.300000");
  });
  test("unknown fees stay unknown; no liquidity invents no payout", () => {
    expect(
      quoteDepth({
        stake: "10",
        quantityIncrement: "1",
        feeBps: null,
        asks: [],
      }).fees,
    ).toBeNull();
    expect(
      quoteDepth({
        stake: "10",
        quantityIncrement: "1",
        feeBps: null,
        asks: [],
      }).totalPayout,
    ).toBe("0.000000");
  });
  test("rounds fees upwards and rejects malformed money", () => {
    expect(
      quoteDepth({
        stake: "1",
        quantityIncrement: "1",
        feeBps: 1,
        asks: [{ price: "0.000001", quantity: "1" }],
      }).fees,
    ).toBe("0.000001");
    for (const value of ["-1", "NaN", "1e6", "0.0000001"])
      expect(() => units(value)).toThrow();
    expect(money(units("999.123456"))).toBe("999.123456");
  });
  test("NO asks complement YES bids exactly", () => {
    expect(
      asksForSide(
        {
          symbol: "x",
          asks: [],
          bids: [{ price: "0.31", quantity: "2" }],
          stale: false,
          updatedAt: "",
          source: "gemini",
          quantityIncrement: "1",
          priceIncrement: "0.01",
        },
        "no",
      )[0]?.price,
    ).toBe("0.690000");
  });
  test("budget invariant over many books", () => {
    for (let i = 1; i < 400; i++) {
      const q = quoteDepth({
        stake: String(i),
        quantityIncrement: "1",
        feeBps: 75,
        asks: [
          { price: "0.33", quantity: "125" },
          { price: "0.67", quantity: "500" },
        ],
      });
      expect(units(q.cost) + units(q.fees!) + units(q.unspent)).toBe(
        units(String(i)),
      );
    }
  });
});
test("funding requires permissions and cannot skip confirmation", () => {
  expect(
    fundingRoute({
      nativeSolana: true,
      cryptoSend: false,
      destinationApproved: true,
      conversion: true,
      evmWalletOwned: true,
      relayLiveQuote: true,
    }),
  ).toBe("manual");
  expect(() => transitionFunding("draft", "checkout_ready")).toThrow();
  expect(transitionFunding("withdrawal_pending", "received_on_solana")).toBe(
    "received_on_solana",
  );
});
test("cart cannot exceed budget", () =>
  expect(() =>
    validateCart([{ mint: "a", ask: "11" }] as never, "10"),
  ).toThrow());
test("quote respects minimum quantity, cent quote rounding and tick anchors", () => {
  expect(
    quoteDepth({
      stake: "0.5",
      quantityIncrement: "0.01",
      quantityMinimum: "2",
      asks: [{ price: "0.5", quantity: "10" }],
      feeBps: 0,
    }).contracts,
  ).toBe("0.000000");
  const q = quoteDepth({
    stake: "0.03",
    quantityIncrement: "0.01",
    priceIncrement: "0.02",
    priceMinimum: "0.01",
    quoteAssetPrecision: 2,
    asks: [{ price: "0.33", quantity: "10" }],
    feeBps: 0,
  });
  expect(q.cost).toBe("0.030000");
  expect(q.contracts).toBe("0.090000");
  expect(() =>
    quoteDepth({
      stake: "10",
      quantityIncrement: "1",
      priceIncrement: "0.02",
      priceMinimum: "0.01",
      asks: [{ price: "0.32", quantity: "10" }],
      feeBps: 0,
    }),
  ).toThrow();
});
test("purchase cannot skip signature, confirmation or owner checks", () => {
  expect(() => transitionPurchase("pending", "owner_verified")).toThrow();
  expect(transitionPurchase("confirmed", "owner_verified")).toBe(
    "owner_verified",
  );
  expect(() =>
    assertFreshListing({ observedAt: "2020-01-01" } as never),
  ).toThrow();
});
