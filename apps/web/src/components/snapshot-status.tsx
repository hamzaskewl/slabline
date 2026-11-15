"use client";
import type { ProviderResult } from "@collectible/domain";

export function SnapshotStatus({
  result,
}: {
  result: ProviderResult<unknown> | undefined;
}) {
  if (!result?.observedAt) return null;
  return (
    <p className="snapshot-status" role="status">
      Saved odds ·{" "}
      <time dateTime={result.observedAt}>
        {new Date(result.observedAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </time>
      {result.error
        ? " · Updates delayed"
        : result.refreshing
          ? " · Updating…"
          : ""}
    </p>
  );
}
