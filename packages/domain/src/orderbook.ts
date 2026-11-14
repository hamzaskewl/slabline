import { decimal, money, units, type Book, type Level } from "./index";

const SCALE = 1_000_000n;
export type DepthRow = Level & {
  minPrice: string;
  maxPrice: string;
  totalShares: string;
  totalValue: string;
};

/** Best price first. Bucketing changes display only; totals use original prices. */
export function depthRows(
  levels: Level[],
  kind: "asks" | "bids",
  increment: string,
): DepthRow[] {
  const tick = units(increment);
  if (tick <= 0n || tick > SCALE) throw new Error("Invalid grouping increment");
  const buckets = new Map<
    bigint,
    { quantity: bigint; value: bigint; min: bigint; max: bigint }
  >();
  for (const level of levels) {
    const price = units(level.price),
      quantity = units(level.quantity);
    if (price <= 0n || price >= SCALE) throw new Error("Invalid book price");
    if (!quantity) continue;
    const bucket =
      kind === "asks"
        ? ((price + tick - 1n) / tick) * tick
        : (price / tick) * tick;
    const previous = buckets.get(bucket) ?? {
      quantity: 0n,
      value: 0n,
      min: price,
      max: price,
    };
    buckets.set(bucket, {
      quantity: previous.quantity + quantity,
      value: previous.value + price * quantity,
      min: price < previous.min ? price : previous.min,
      max: price > previous.max ? price : previous.max,
    });
  }
  let totalShares = 0n,
    totalValue = 0n;
  return [...buckets.entries()]
    .sort(([a], [b]) =>
      a === b ? 0 : (a < b ? -1 : 1) * (kind === "asks" ? 1 : -1),
    )
    .map(([price, level]) => {
      totalShares += level.quantity;
      totalValue += level.value;
      return {
        price: money(price),
        minPrice: money(level.min),
        maxPrice: money(level.max),
        quantity: money(level.quantity),
        totalShares: money(totalShares),
        totalValue: money((totalValue + SCALE / 2n) / SCALE),
      };
    });
}

export function bookForSide(
  book: Pick<Book, "asks" | "bids">,
  side: "yes" | "no",
) {
  const invert = (levels: Level[]) =>
    levels.map((l) => ({
      price: money(SCALE - units(l.price)),
      quantity: l.quantity,
    }));
  return side === "yes"
    ? { asks: book.asks, bids: book.bids }
    : { asks: invert(book.bids), bids: invert(book.asks) };
}

export function bookSpread(book: Pick<Book, "asks" | "bids">): string | null {
  if (!book.asks.length || !book.bids.length) return null;
  const ask = book.asks.reduce(
    (best, l) => (units(l.price) < best ? units(l.price) : best),
    SCALE,
  );
  const bid = book.bids.reduce(
    (best, l) => (units(l.price) > best ? units(l.price) : best),
    0n,
  );
  // A crossed snapshot is not a usable spread.
  return ask >= bid ? money(ask - bid) : null;
}

export function sidePrice(price: string | null, side: "yes" | "no") {
  if (price === null || !decimal.safeParse(price).success) return null;
  const value = units(price);
  if (value > SCALE) return null;
  return side === "yes" ? money(value) : money(SCALE - value);
}

export function cents(
  price: string | null,
  increment = "0.01",
  average = false,
) {
  if (price === null) return "—";
  const precision = Math.max(
    0,
    (increment.split(".")[1]?.replace(/0+$/, "").length ?? 0) - 2,
  );
  return (
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: average ? 0 : precision,
      maximumFractionDigits: average ? Math.max(2, precision) : precision,
    }).format(Number(price) * 100) + "¢"
  );
}
