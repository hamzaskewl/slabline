import { expect, test } from "bun:test";
import { DEMO_REPLAY, type Book } from "@collectible/domain";
import { waitForBookSnapshot } from "./book-snapshot";

test("a cold book request waits for the initial snapshot instead of reporting a closed market", async () => {
  let book: Book | null = null;
  setTimeout(() => {
    book = { ...DEMO_REPLAY.book };
  }, 10);
  expect(await waitForBookSnapshot(() => book, 300)).toEqual(DEMO_REPLAY.book);
});
test("a live book returns immediately and missing depth times out without inventing liquidity", async () => {
  expect(await waitForBookSnapshot(() => DEMO_REPLAY.book)).toEqual(
    DEMO_REPLAY.book,
  );
  expect(await waitForBookSnapshot(() => null, 10)).toBeNull();
});
