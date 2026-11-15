import { test, expect } from "bun:test";
import { normalizeGrailRewardDetails } from "./grail";
import type { GrailToken } from "@collectible/domain";

// Named simulated response for normalization and fail-closed tests, not catalog data.
const token: GrailToken = {
  id: "fixture",
  symbol: "TEST",
  name: "Fixture",
  chainId: 8453,
  chain: "Base",
  address: `0x${"1".repeat(40)}`,
  image: null,
  tags: [],
  url: "https://grail.xyz",
  observedAt: new Date().toISOString(),
};
const fixture = {
  chain_id: 8453,
  token_address: token.address,
  symbol: "TEST",
  market_price: 0.125,
  unpriced: false,
  ohlcv_list: [
    [100, 1, 1, 1, 0.125, 10],
    [200, 0, 0, 0, 0, 0],
  ],
  reserves: [
    {
      reserve_address: `0x${"2".repeat(40)}`,
      name: "Test reserve",
      image_url: "javascript:alert(1)",
      multiplier: 10000,
      vaulted_cards_count: 2,
      available_nfts_count: 1,
    },
  ],
};

test("Grail previews preserve reported reserve thresholds and reject unsafe images", () => {
  const result = normalizeGrailRewardDetails(fixture, token);
  expect(result.priceUsd).toBe("0.125000000000");
  expect(result.reserves[0]).toMatchObject({
    tokensPerItem: "10000",
    vaulted: 2,
    available: 1,
    image: null,
  });
  expect(result.history).toEqual([{ time: 100, price: 0.125, volume: 10 }]);
  expect(
    normalizeGrailRewardDetails({ ...fixture, unpriced: true }, token).priceUsd,
  ).toBeNull();
});

test("Grail details fail closed on token, chain, threshold and price mismatches", () => {
  expect(() =>
    normalizeGrailRewardDetails({ ...fixture, chain_id: 1 }, token),
  ).toThrow("identity mismatch");
  expect(() =>
    normalizeGrailRewardDetails(
      { ...fixture, token_address: `0x${"3".repeat(40)}` },
      token,
    ),
  ).toThrow("identity mismatch");
  expect(() =>
    normalizeGrailRewardDetails({ ...fixture, symbol: "WRONG" }, token),
  ).toThrow("identity mismatch");
  expect(() =>
    normalizeGrailRewardDetails({ ...fixture, market_price: -1 }, token),
  ).toThrow();
  expect(() =>
    normalizeGrailRewardDetails(
      { ...fixture, reserves: [{ ...fixture.reserves[0], multiplier: 0 }] },
      token,
    ),
  ).toThrow();
});
