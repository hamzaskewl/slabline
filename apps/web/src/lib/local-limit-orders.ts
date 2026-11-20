import { z } from "zod";
import { money, units } from "@collectible/domain";

const amount = z.string().regex(/^\d+(\.\d{1,6})?$/);
const orderSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string().min(1).max(160),
  label: z.string().min(1).max(1000),
  direction: z.enum(["buy", "sell"]),
  side: z.enum(["yes", "no"]),
  price: amount.refine((v) => units(v) > 0n && units(v) < 1000000n),
  quantity: amount.refine((v) => units(v) > 0n && units(v) <= 1000000000000n),
  createdAt: z.string().datetime(),
});
export type LocalLimitOrder = z.infer<typeof orderSchema>;

export const localLimitOrderKey = (owner: string, network: string) =>
  `slabline:local-limit-orders:v1:${encodeURIComponent(owner)}:${network}`;

export function readLocalLimitOrders(raw: string | null): LocalLimitOrder[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = orderSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function createLocalLimitOrder(input: {
  symbol: string;
  label: string;
  direction: "buy" | "sell";
  side: "yes" | "no";
  priceCents: string;
  quantity: string;
}): LocalLimitOrder {
  if (
    !/^\d+(\.\d{1,2})?$/.test(input.priceCents) ||
    units(input.priceCents) <= 0n ||
    units(input.priceCents) >= 100000000n
  )
    throw new Error("Enter a limit price from 0.01 to 99.99 cents.");
  if (
    !/^\d+(\.\d{1,6})?$/.test(input.quantity) ||
    units(input.quantity) <= 0n ||
    units(input.quantity) > 1000000000000n
  )
    throw new Error("Enter a share count greater than zero, up to 1,000,000.");
  return orderSchema.parse({
    id: crypto.randomUUID(),
    symbol: input.symbol,
    label: input.label,
    direction: input.direction,
    side: input.side,
    price: money(units(input.priceCents) / 100n),
    quantity: money(units(input.quantity)),
    createdAt: new Date().toISOString(),
  });
}

export const localLimitOrderTotal = (order: LocalLimitOrder) =>
  money((units(order.price) * units(order.quantity)) / 1000000n);
