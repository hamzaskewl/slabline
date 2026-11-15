"use client";
import { useEffect, useState } from "react";
import type { Book, PricePoint } from "@collectible/domain";
import { practiceBook } from "@collectible/integrations/fixtures";
import { usableLiveBook } from "./book-freshness";

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
    const activeSymbol = symbol;
    if (practice) {
      setBook(practiceBook());
      return;
    }
    let stream: EventSource | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let stopped = false,
      attempts = 0,
      lastMessageAt = Date.now();
    const recover = () => {
      if (stopped || reconnect) return;
      stream?.close();
      setStreamError("Connection interrupted. Reconnecting…");
      setBook((b) => (b ? { ...b, stale: true } : null));
      reconnect = setTimeout(
        connect,
        Math.min(15000, 1000 * 2 ** Math.min(attempts++, 4)),
      );
    };
    function connect() {
      reconnect = undefined;
      if (stopped) return;
      lastMessageAt = Date.now();
      stream = new EventSource(
        `/api/events?symbol=${encodeURIComponent(activeSymbol)}`,
      );
      stream.onmessage = (e) => {
        if (stopped) return;
        try {
          const update = JSON.parse(e.data) as {
            book: Book | null;
            error: string | null;
            latestTrade?: PricePoint | null;
          };
          lastMessageAt = Date.now();
          attempts = 0;
          setBook(update.book);
          setLastHeartbeat(Date.now());
          setStreamError(update.error);
          if (update.latestTrade)
            setTrade((previous) =>
              previous?.symbol === symbol &&
              previous?.time === update.latestTrade?.time &&
              previous?.value === update.latestTrade?.value
                ? previous
                : { ...update.latestTrade!, symbol: activeSymbol },
            );
        } catch {
          setStreamError("Unsupported book update");
          recover();
        }
      };
      // HTTP errors can permanently close EventSource; explicitly recreate it.
      stream.onerror = recover;
    }
    connect();
    const updateClock = () => {
      setNow(Date.now());
      if (Date.now() - lastMessageAt > 20000) recover();
    };
    const timer = setInterval(updateClock, 1000);
    document.addEventListener("visibilitychange", updateClock);
    return () => {
      stopped = true;
      stream?.close();
      clearTimeout(reconnect);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", updateClock);
    };
  }, [symbol, practice]);
  const book = receivedBook?.symbol === symbol ? receivedBook : null;
  const latestTrade = trade?.symbol === symbol ? trade : null;
  const stale =
    !!book &&
    !usableLiveBook(
      book,
      symbol,
      lastHeartbeat,
      Math.max(now, Date.now()),
      practice,
    );
  return { symbol, book, latestTrade, stale, streamError };
}
export type LiveBookState = ReturnType<typeof useLiveBook>;
