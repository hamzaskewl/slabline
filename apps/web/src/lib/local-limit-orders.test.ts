import { expect, test } from "bun:test";
import {
  createLocalLimitOrder,
  localLimitOrderKey,
  localLimitOrderTotal,
  readLocalLimitOrders,
} from "./local-limit-orders";

const input = {
  symbol: "GEMI-USSTAKE-NVIDIA",
  label: "Nvidia",
  direction: "buy" as const,
  side: "yes" as const,
  priceCents: "7.25",
  quantity: "255",
};

test("local limit orders retain exact cents, shares, and totals without execution", () => {
  const order = createLocalLimitOrder(input);
  expect(order.price).toBe("0.072500");
  expect(order.quantity).toBe("255.000000");
  expect(localLimitOrderTotal(order)).toBe("18.487500");
  expect(readLocalLimitOrders(JSON.stringify([order]))).toEqual([order]);
  const sell = createLocalLimitOrder({
    ...input,
    direction: "sell",
    side: "no",
  });
  expect(sell.direction).toBe("sell");
  expect(sell.side).toBe("no");
  expect(order).not.toHaveProperty("signature");
});

test("local orders reject invalid prices and share counts", () => {
  for (const priceCents of ["0", "100", "-1", "7.251", "1e2", "NaN"])
    expect(() => createLocalLimitOrder({ ...input, priceCents })).toThrow();
  for (const quantity of ["0", "-1", "1000001", "1e9", "1.0000001"])
    expect(() => createLocalLimitOrder({ ...input, quantity })).toThrow();
});

test("stored local orders tolerate damaged records and isolate accounts and networks", () => {
  const order = createLocalLimitOrder(input);
  expect(readLocalLimitOrders("broken")).toEqual([]);
  expect(readLocalLimitOrders('{"items":[]}')).toEqual([]);
  expect(
    readLocalLimitOrders(JSON.stringify([order, { ...order, price: "1" }])),
  ).toEqual([order]);
  expect(localLimitOrderKey("user-a", "devnet")).not.toBe(
    localLimitOrderKey("user-b", "devnet"),
  );
  expect(localLimitOrderKey("user-a", "devnet")).not.toBe(
    localLimitOrderKey("user-a", "mainnet"),
  );
});
