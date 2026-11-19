import { getDb, providerBudgets, sql, and, eq, lte } from "@collectible/db";

// Published RPC costs are 20/30 credits (60 for DAS). Reserve 1,000 per
// individual JSON-RPC call, including failed requests and every retry. Never
// refund: a timeout cannot prove that the provider did not bill the request.
export const QUICKNODE_CALL_RESERVATION = 1000;
const methods = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getCode",
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "getBalance",
  "getTokenAccountsByOwner",
  "getAccountInfo",
  "getMultipleAccounts",
  "getFeeForMessage",
  "getLatestBlockhash",
  "isBlockhashValid",
  "simulateTransaction",
  "getSignatureStatuses",
  "getTransaction",
  "getSignaturesForAddress",
  "getAsset",
  "getAssetsByOwner",
  "getSlot",
  "getGenesisHash",
]);
export class QuickNodeBudgetClosed extends Error {
  constructor() {
    super("QuickNode credit allowance unavailable; metered request stopped.");
  }
}
export type CreditBudget = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  limit: number;
  baseline: number;
};
export function configuredQuickNodeBudget(now = Date.now()): CreditBudget {
  const id = process.env.QUICKNODE_BUDGET_ID ?? "";
  const startsAt = new Date(process.env.QUICKNODE_BUDGET_START ?? "");
  const endsAt = new Date(process.env.QUICKNODE_BUDGET_END ?? "");
  const limit = Number(process.env.QUICKNODE_CREDIT_CUTOFF);
  const included = Number(process.env.QUICKNODE_INCLUDED_CREDITS);
  const baseline = Number(process.env.QUICKNODE_BASELINE_CREDITS);
  if (
    !id ||
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(endsAt.getTime()) ||
    now < startsAt.getTime() ||
    now >= endsAt.getTime() ||
    !Number.isSafeInteger(included) ||
    included <= 0 ||
    included > 1_000_000_000 ||
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    limit > Math.floor(included * 0.75) ||
    !Number.isSafeInteger(baseline) ||
    baseline < 0 ||
    baseline >= limit
  )
    throw new QuickNodeBudgetClosed();
  return { id, startsAt, endsAt, limit, baseline };
}
export function isQuickNodeUrl(url: string) {
  const host = new URL(url).hostname;
  return host.endsWith(".quiknode.pro") || host.endsWith(".quicknode.pro");
}
export function rpcReservation(payload: unknown): number {
  const calls = Array.isArray(payload) ? payload : [payload];
  if (
    !calls.length ||
    calls.length > 100 ||
    calls.some(
      (c) =>
        !c ||
        typeof c !== "object" ||
        !methods.has((c as { method: string }).method),
    )
  )
    throw new QuickNodeBudgetClosed();
  return calls.length * QUICKNODE_CALL_RESERVATION;
}
export async function reserveQuickNodeCredits(
  budget: CreditBudget,
  credits: number,
) {
  if (
    !Number.isSafeInteger(credits) ||
    credits <= 0 ||
    budget.baseline + credits > budget.limit ||
    Date.now() < budget.startsAt.getTime() ||
    Date.now() >= budget.endsAt.getTime()
  )
    throw new QuickNodeBudgetClosed();
  try {
    const reserved = await getDb()
      .insert(providerBudgets)
      .values({
        id: budget.id,
        startsAt: budget.startsAt,
        endsAt: budget.endsAt,
        limitCredits: budget.limit,
        reservedCredits: budget.baseline + credits,
      })
      .onConflictDoUpdate({
        target: providerBudgets.id,
        set: {
          reservedCredits: sql`${providerBudgets.reservedCredits} + ${credits}`,
          updatedAt: new Date(),
        },
        where: and(
          eq(providerBudgets.startsAt, budget.startsAt),
          eq(providerBudgets.endsAt, budget.endsAt),
          eq(providerBudgets.limitCredits, budget.limit),
          lte(
            sql`${providerBudgets.reservedCredits} + ${credits}`,
            budget.limit,
          ),
        ),
      })
      .returning({ id: providerBudgets.id });
    if (!reserved.length || Date.now() >= budget.endsAt.getTime())
      throw new QuickNodeBudgetClosed();
  } catch {
    throw new QuickNodeBudgetClosed();
  }
}
export async function reserveQuickNodeRpc(payload: unknown) {
  await reserveQuickNodeCredits(
    configuredQuickNodeBudget(),
    rpcReservation(payload),
  );
}
type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
// Both viem and direct DAS reads pass through this boundary. Unknown methods
// never reach QuickNode. Batches reserve for every member, not one HTTP call.
export function quickNodeFetch(
  fallback?: string,
  fetcher: Fetch = globalThis.fetch,
  reserve = reserveQuickNodeRpc,
): Fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!isQuickNodeUrl(url)) return fetcher(input, init);
    const request = new Request(input, init);
    let useFallback = false;
    try {
      await reserve(JSON.parse(await request.clone().text()));
    } catch {
      useFallback = true;
    }
    if (useFallback) {
      if (!fallback || isQuickNodeUrl(fallback))
        throw new QuickNodeBudgetClosed();
      // Do not carry provider authorization headers to the public fallback.
      return fetcher(fallback, {
        method: "POST",
        body: await request.text(),
        headers: { "Content-Type": "application/json" },
        signal: request.signal,
      });
    }
    try {
      return await fetcher(request, { redirect: "error" });
    } catch {
      throw new Error("QuickNode RPC request failed");
    }
  };
}
