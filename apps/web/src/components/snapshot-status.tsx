"use client";
import type { ProviderResult } from "@collectible/domain";

export function SnapshotStatus({
  result,
}: {
  result: ProviderResult<unknown> | undefined;
}) {
  if (!result?.error) return null;
  return (
    <p className="snapshot-status" role="status">
      Market updates delayed
    </p>
  );
}
