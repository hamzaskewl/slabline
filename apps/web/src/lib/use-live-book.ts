"use client";
import { useEffect, useState } from "react";
import type { Book, PricePoint } from "@collectible/domain";
import { practiceBook } from "@collectible/integrations/fixtures";

/** One subscription per selected symbol; an undefined symbol disables it. */
export function useLiveBook(symbol: string | undefined, practice: boolean) {
  const [receivedBook, setBook] = useState<Book | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [lastHeartbeat, setLastHeartbeat] = useState(0);
  const [now, setNow] = useState(0);
  const [trade, setTrade] = useState<(PricePoint & { symbol: string }) | null>(
    null,
  );
  useEffect(() => {
    setBook(null);
    setTrade(null);
    setStreamError(null);
    if (!symbol) return;
    if (practice) {
      setBook(practiceBook());
      return;
    }
    const stream = new EventSource(
      `/api/events?symbol=${encodeURIComponent(symbol)}`,
    );
    stream.onmessage = (e) => {
      try {
        const update = JSON.parse(e.data) as {
          book: Book | null;
          error: string | null;
          latestTrade?: PricePoint | null;
        };
        setBook(update.book);
        setLastHeartbeat(Date.now());
        setStreamError(update.error);
        if (update.latestTrade)
          setTrade((previous) =>
            previous?.symbol === symbol &&
            previous?.time === update.latestTrade?.time &&
            previous?.value === update.latestTrade?.value
              ? previous
              : { ...update.latestTrade!, symbol },
          );
      } catch {
        setStreamError("Unsupported book update");
      }
    };
    stream.onerror = () => {
      setStreamError("Connection interrupted. Reconnecting…");
      setBook((b) => (b ? { ...b, stale: true } : null));
    };
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stream.close();
      clearInterval(timer);
    };
  }, [symbol, practice]);
  const book = receivedBook?.symbol === symbol ? receivedBook : null;
  const latestTrade = trade?.symbol === symbol ? trade : null;
  const stale = !!(
    book?.stale ||
    (!practice && book && now - lastHeartbeat > 15000)
  );
  return { symbol, book, latestTrade, stale, streamError };
}
export type LiveBookState = ReturnType<typeof useLiveBook>;
