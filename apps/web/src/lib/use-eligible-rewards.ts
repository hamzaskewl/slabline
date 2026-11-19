"use client";
import { useEffect, useMemo, useState } from "react";
import {
  sportCategories,
  tokenSport,
  type GrailToken,
  type Listing,
  type Market,
} from "@collectible/domain";

type Inventory = { cards: Listing[]; tokens: GrailToken[] };
type Result = Inventory & {
  source: Inventory;
  markets: Market[];
  error?: string;
};
export function useEligibleRewards(
  inventory: Inventory | undefined,
  markets: Market[] | undefined,
  enabled: boolean,
) {
  const [result, setResult] = useState<Result | null>(null);
  const sports = useMemo(
    () => ({
      cards:
        inventory?.cards.filter((card) =>
          sportCategories.includes(card.category),
        ) ?? [],
      tokens: inventory?.tokens.filter((token) => tokenSport(token)) ?? [],
    }),
    [inventory],
  );
  useEffect(() => {
    if (!enabled || !inventory || !markets) return;
    let worker: Worker | undefined;
    const fail = () =>
      setResult({
        ...sports,
        source: inventory,
        markets,
        error:
          "Other collectibles could not be matched. Sports rewards are still available. Reload to retry.",
      });
    try {
      worker = new Worker(
        new URL("./reward-eligibility.worker.ts", import.meta.url),
      );
      worker.onmessage = (event: MessageEvent<Inventory>) =>
        setResult({ ...event.data, source: inventory, markets });
      worker.onerror = fail;
      worker.postMessage({ ...inventory, markets });
    } catch {
      fail();
    }
    return () => {
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      }
    };
  }, [enabled, inventory, markets, sports]);
  const current =
    result?.source === inventory && result?.markets === markets ? result : null;
  return {
    ...(current ?? sports),
    pending: enabled && !current,
    error: current?.error,
  };
}
