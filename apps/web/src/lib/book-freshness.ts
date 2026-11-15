import type { Book } from "@collectible/domain";
export function usableLiveBook(
  book: Book | null,
  symbol: string | undefined,
  heartbeat: number,
  now: number,
  practice = false,
) {
  return (
    !!book &&
    book.symbol === symbol &&
    !book.stale &&
    (practice
      ? book.source === "fixture"
      : book.source === "gemini" && heartbeat > 0 && now - heartbeat <= 15000)
  );
}
