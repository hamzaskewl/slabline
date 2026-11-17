import { expect, test } from "bun:test";
import { getDb, providerBudgets, eq } from "@collectible/db";
import {
  configuredQuickNodeBudget,
  rpcReservation,
  quickNodeFetch,
  reserveQuickNodeCredits,
  QuickNodeBudgetClosed,
  type CreditBudget,
} from "./quicknode-budget";

test("QuickNode counts every batch member and refuses unknown or empty requests", () => {
  expect(rpcReservation([{ method: "eth_call" }, { method: "getAsset" }])).toBe(
    2000,
  );
  for (const payload of [
    [],
    null,
    { method: "debug_traceTransaction" },
    [{ method: "getBalance" }, { method: "unpriced_method" }],
  ])
    expect(() => rpcReservation(payload)).toThrow(QuickNodeBudgetClosed);
});

test("QuickNode configuration expires without automatically replenishing credits", () => {
  const env = {
    QUICKNODE_BUDGET_ID: "fixture-period",
    QUICKNODE_BUDGET_START: "2026-01-01T00:00:00Z",
    QUICKNODE_BUDGET_END: "2026-02-01T00:00:00Z",
    QUICKNODE_INCLUDED_CREDITS: "80000000",
    QUICKNODE_CREDIT_CUTOFF: "60000000",
    QUICKNODE_BASELINE_CREDITS: "1000000",
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((k) => [k, process.env[k]]),
  );
  try {
    Object.assign(process.env, env);
    expect(
      configuredQuickNodeBudget(Date.parse("2026-01-15T00:00:00Z")).limit,
    ).toBe(60000000);
    expect(() =>
      configuredQuickNodeBudget(Date.parse(env.QUICKNODE_BUDGET_END)),
    ).toThrow();
    process.env.QUICKNODE_CREDIT_CUTOFF = "80000000";
    expect(() =>
      configuredQuickNodeBudget(Date.parse("2026-01-15T00:00:00Z")),
    ).toThrow();
  } finally {
    for (const [k, v] of Object.entries(previous))
      v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
});

test("exhausted budget never contacts QuickNode; public fallback strips credentials", async () => {
  const calls: { url: string; headers: Headers }[] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return Response.json({ result: "public" });
  };
  const blocked = async () => {
    throw new QuickNodeBudgetClosed();
  };
  const request = {
    method: "POST",
    headers: { "x-token": "fixture-secret" },
    body: JSON.stringify({ method: "eth_call" }),
  };
  await quickNodeFetch(
    "https://mainnet.base.org",
    fetcher,
    blocked,
  )("https://fixture.quiknode.pro/fixture-secret", request);
  expect(calls.map((c) => c.url)).toEqual(["https://mainnet.base.org"]);
  expect(calls[0]!.headers.has("x-token")).toBe(false);
  await expect(
    quickNodeFetch(
      undefined,
      fetcher,
      blocked,
    )("https://fixture.quiknode.pro/fixture-secret", request),
  ).rejects.toThrow(QuickNodeBudgetClosed);
  expect(calls).toHaveLength(1);
});

test("network failures keep their credit reservation and each retry reserves again", async () => {
  let reserved = 0,
    sent = 0;
  const reserve = async (payload: unknown) => {
    reserved += rpcReservation(payload);
  };
  const fetcher = async () => {
    sent++;
    throw new Error("https://fixture.quiknode.pro/fixture-secret");
  };
  const send = quickNodeFetch(undefined, fetcher, reserve);
  for (let attempt = 0; attempt < 3; attempt++)
    await expect(
      send("https://fixture.quiknode.pro/fixture-secret", {
        method: "POST",
        body: JSON.stringify([
          { method: "eth_call" },
          { method: "eth_chainId" },
        ]),
      }),
    ).rejects.toThrow("QuickNode RPC request failed");
  expect(sent).toBe(3);
  expect(reserved).toBe(6000);
});

test("public RPC reads bypass the metered budget", async () => {
  let reserved = false;
  await quickNodeFetch(
    undefined,
    async () => Response.json({ result: 1 }),
    async () => {
      reserved = true;
    },
  )("https://api.devnet.solana.com");
  expect(reserved).toBe(false);
});

test.skipIf(!process.env.DATABASE_URL)(
  "Postgres shares an atomic cutoff across concurrent clients and restarts",
  async () => {
    const budget: CreditBudget = {
      id: `fixture-budget-${crypto.randomUUID()}`,
      startsAt: new Date(Date.now() - 60000),
      endsAt: new Date(Date.now() + 60000),
      limit: 5000,
      baseline: 1000,
    };
    const db = getDb();
    try {
      const attempts = await Promise.allSettled(
        Array.from({ length: 30 }, () => reserveQuickNodeCredits(budget, 1000)),
      );
      expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(4);
      const [row] = await db
        .select()
        .from(providerBudgets)
        .where(eq(providerBudgets.id, budget.id));
      expect(row?.reservedCredits).toBe(5000);
      await expect(
        reserveQuickNodeCredits({ ...budget }, 1000),
      ).rejects.toThrow(QuickNodeBudgetClosed);
      await expect(
        reserveQuickNodeCredits({ ...budget, limit: 10000 }, 1000),
      ).rejects.toThrow(QuickNodeBudgetClosed);
      await expect(
        reserveQuickNodeCredits(
          { ...budget, endsAt: new Date(Date.now() - 1) },
          1000,
        ),
      ).rejects.toThrow(QuickNodeBudgetClosed);
    } finally {
      await db.delete(providerBudgets).where(eq(providerBudgets.id, budget.id));
    }
  },
);
