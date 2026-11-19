import type { Book } from "@collectible/domain";

/** A new subscription exists before its first WebSocket snapshot arrives. */
export async function waitForBookSnapshot(
  read: () => Book | null,
  timeoutMs = 8000,
) {
  const deadline = Date.now() + timeoutMs;
  let book = read();
  while ((!book || book.stale) && Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now()))),
    );
    book = read();
  }
  return book;
}
