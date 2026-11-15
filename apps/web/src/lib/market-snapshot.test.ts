import { expect, test } from "bun:test";
import type { Book, ProviderResult } from "@collectible/domain";
import { retainMarketSnapshot } from "./market-snapshot";
import { usableLiveBook } from "./book-freshness";

test("failed public refresh preserves saved markets and labels them stale", () => {
  const previous: ProviderResult<string[]> = {
    data: ["saved"],
    source: "cache",
    observedAt: "2026-11-15T00:00:00Z",
    error: null,
  };
  const next = retainMarketSnapshot(previous, {
    data: [],
    source: "unavailable",
    observedAt: "",
    error: "worker unavailable",
  });
  expect(next.data).toEqual(["saved"]);
  expect(next.observedAt).toBe(previous.observedAt);
  expect(next.stale).toBe(true);
  expect(next.error).toBe("worker unavailable");
  expect(
    retainMarketSnapshot(previous, { ...previous, data: [] }).data,
  ).toEqual([]);
});

test("live odds and payout reject expired heartbeats, stale books, other symbols and fixture books", () => {
  const book: Book = {
    symbol: "TEST",
    source: "gemini",
    stale: false,
    updatedAt: new Date().toISOString(),
    bids: [],
    asks: [],
    quantityIncrement: "1",
    priceIncrement: "0.01",
  };
  expect(usableLiveBook(book, "TEST", 1000, 2000)).toBe(true);
  expect(usableLiveBook(book, "TEST", 1000, 16001)).toBe(false);
  expect(usableLiveBook({ ...book, stale: true }, "TEST", 1000, 2000)).toBe(
    false,
  );
  expect(usableLiveBook(book, "OTHER", 1000, 2000)).toBe(false);
  expect(
    usableLiveBook({ ...book, source: "fixture" }, "TEST", 1000, 2000),
  ).toBe(false);
  expect(usableLiveBook(null, "TEST", 1000, 2000)).toBe(false);
});
