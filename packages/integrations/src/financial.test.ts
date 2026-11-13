import { expect, test } from "bun:test";
import {
  blockedGeminiTrading,
  blockedRelay,
  collectorCryptTransactions,
  getFundingQuote,
} from "./financial";
import type { Listing } from "@collectible/domain";
test("unverified funding fees and route remain blocked, never fabricated", () => {
  const quote = getFundingQuote("100");
  expect(quote.netSpendable).toBeNull();
  expect(quote.networkFee).toBeNull();
  expect(quote.state).toBe("unsupported");
  expect(quote.route).toBe("manual");
});
test("mainnet purchase and CEX bridge cannot be enabled by a flag", async () => {
  const card = {
    observedAt: new Date().toISOString(),
    ask: "10",
    grade: "9",
    grader: "PSA",
    cert: "fixture",
    network: "mainnet",
  } as Listing;
  await expect(
    collectorCryptTransactions.buildBuyTransaction(
      card,
      "11111111111111111111111111111111",
    ),
  ).rejects.toThrow("Mainnet");
  await expect(blockedRelay.execute({} as never)).rejects.toThrow(
    "user-signed",
  );
  await expect(blockedGeminiTrading.withdrawUSDC({} as never)).rejects.toThrow(
    "crypto:send",
  );
});
