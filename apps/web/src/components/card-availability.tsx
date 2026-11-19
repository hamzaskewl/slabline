import { SlablineMark } from "./slabline-mark";

export function CardAvailability({ available }: { available: boolean }) {
  if (!available) return null;
  return (
    <span
      className="card-availability"
      role="img"
      aria-label="Matching cards available"
      title="Matching cards are listed for purchase. Enter an amount to see what your potential payout could get. Prices and availability are checked when you select a card."
    >
      <SlablineMark height={16} />
    </span>
  );
}
