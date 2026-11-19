import type { Valuation } from "@collectible/domain";
import { usd } from "@/lib/utils";
export function CardValue({ valuation }: { valuation?: Valuation | null }) {
  const valid = valuation && Date.parse(valuation.expiresAt) > Date.now();
  return (
    <span
      className="card-fmv"
      title={
        valid
          ? `${valuation.methodology} · ${new Date(valuation.observedAt).toLocaleDateString()}`
          : "No current matched Card Hedge estimate is available for this card."
      }
    >
      <span>
        Fair market value <small>Card Hedge</small>
      </span>
      <strong>
        {valid ? usd(valuation.fmv) : "Unavailable"}
        {valid && valuation.confidence === "low" && (
          <small>Low confidence</small>
        )}
      </strong>
    </span>
  );
}
