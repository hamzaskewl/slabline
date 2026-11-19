export function pullRequestStatus(
  status: { confirmationStatus?: string | null; err: unknown } | null,
  finalizedHeight?: bigint,
  expiry?: string,
) {
  if (status) {
    if (status.confirmationStatus !== "finalized") return "waiting";
    return status.err ? "replace" : "finalized";
  }
  if (
    finalizedHeight !== undefined &&
    expiry &&
    /^\d+$/.test(expiry) &&
    finalizedHeight > BigInt(expiry)
  )
    return "replace";
  return "unseen";
}
