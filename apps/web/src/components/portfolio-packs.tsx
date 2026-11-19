"use client";
import Link from "next/link";
import type { PullOpening } from "@collectible/domain";
import { usePrivateRead } from "@/lib/use-private-read";
import { UsdcAmount } from "./usdc-amount";

export function PortfolioPacks() {
  const account = usePrivateRead<{ openings: PullOpening[] }>("/api/pull");
  const packs =
    account.data?.openings.filter(
      (pack) => pack.state === "ready" || pack.state === "pending",
    ) ?? [];
  return (
    <>
      {account.isPending && <p role="status">Loading packs…</p>}
      {account.error && (
        <p role="alert">
          {account.error.message}{" "}
          <button
            className="text-button"
            onClick={() => void account.refetch()}
          >
            Retry
          </button>
        </p>
      )}
      {packs.map((pack) => (
        <div className="portfolio-pack-row" key={pack.id}>
          <div>
            <h3>
              <UsdcAmount value={pack.tier} /> pack
            </h3>
            <p>
              {pack.state === "ready" ? (
                <>
                  <UsdcAmount value={pack.budget ?? "0"} /> ready to play
                </>
              ) : (
                "Opening in progress"
              )}
            </p>
          </div>
          <Link
            className="button button-outline button-pill"
            href={`/pull-predict/packs?opening=${pack.id}`}
          >
            {pack.state === "ready" ? "Choose a prediction" : "View pack"}
          </Link>
        </div>
      ))}
      {!account.isPending && !account.error && !packs.length && (
        <div className="holdings-empty">
          <p>Your unplayed packs will appear here.</p>
          <Link className="text-link" href="/pull-predict">
            Explore packs
          </Link>
        </div>
      )}
    </>
  );
}
