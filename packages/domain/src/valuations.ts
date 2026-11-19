import type { Valuation } from "./index";

export function currentFmv(
  valuation: Valuation | null | undefined,
  now = Date.now(),
): number | null {
  if (!valuation || Date.parse(valuation.expiresAt) <= now) return null;
  const value = Number(valuation.fmv);
  return Number.isFinite(value) &&
    value > 0 &&
    Number.isFinite(Date.parse(valuation.expiresAt))
    ? value
    : null;
}

export function fmvComparison(
  valuation: Valuation | null | undefined,
  ask?: string | null,
  now = Date.now(),
) {
  const value = currentFmv(valuation, now);
  const listed = ask ? Number(ask) : NaN;
  if (value === null || !Number.isFinite(listed) || listed <= 0)
    return { value, tone: "neutral" as const, difference: null };
  const ratio = listed / value;
  return {
    value,
    tone:
      ratio <= 1.1
        ? ("green" as const)
        : ratio <= 1.25
          ? ("amber" as const)
          : ("red" as const),
    difference: (ratio - 1) * 100,
  };
}
