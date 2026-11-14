import { z } from "zod";

import {
  getDb,
  orders,
  walletLinks,
  auditEvents,
  eq,
  and,
  gt,
  inArray,
  sql,
} from "@collectible/db";
import {
  evmAddress,
  evmChainId,
  evmHash,
  type GrailQuote,
  type PreparedGrailAction,
  type GrailOrderView,
} from "@collectible/domain";
import {
  quoteGrail,
  grailReleaseBlocker,
  checkGrailTrade,
  assertGrailTransaction,
  checkedClient,
  evmBalances,
  findGrailToken,
  grailMarket,
  grailSpend,
  prepareGrail,
  EvmTradingError,
} from "@collectible/integrations";
import {
  apiRoute,
  authenticate,
  requireOrigin,
  boundedJson,
  ApiError,
} from "@/server/auth";

type OrderData = {
  kind: "grail-direct";
  quote: GrailQuote;
  prepared?: PreparedGrailAction;
  transactionHash?: string;
  received?: string;
};
const selection = {
  chainId: evmChainId,
  wallet: evmAddress,
  buyToken: evmAddress,
};
const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("quote"),
    ...selection,
    amount: z.string().regex(/^\d+(\.\d{1,18})?$/),
    slippageBps: z.number().int().min(30).max(100),
    idempotencyKey: z.string().uuid(),
  }),
  z.object({ action: z.literal("balances"), ...selection }),
  z.object({ action: z.literal("resume"), ...selection }),
  z.object({ action: z.literal("prepare"), id: z.string().uuid() }),
  z.object({ action: z.literal("signing"), id: z.string().uuid() }),
  z.object({ action: z.literal("rejected"), id: z.string().uuid() }),
  z.object({ action: z.literal("status"), id: z.string().uuid() }),
  z.object({
    action: z.literal("broadcasted"),
    id: z.string().uuid(),
    hash: evmHash,
  }),
]);
function view(row: typeof orders.$inferSelect): GrailOrderView {
  const data = row.data as OrderData;
  return {
    id: row.id,
    state: row.state,
    quote: data.quote,
    blocker: grailReleaseBlocker(data.quote.wallet, data.quote.chainId),
    canSubmit: !grailReleaseBlocker(data.quote.wallet, data.quote.chainId),
    transactionHash: data.transactionHash,
    received: data.received,
    prepared: data.prepared,
  };
}
export async function POST(request: Request) {
  return apiRoute(async () => {
    try {
      requireOrigin(request);
      const user = await authenticate(request),
        db = getDb();
      const parsed = inputSchema.safeParse(await boundedJson(request));
      if (!parsed.success) throw new ApiError(400, "Invalid trade request.");
      const input = parsed.data;
      if (
        input.action === "quote" ||
        input.action === "balances" ||
        input.action === "resume"
      ) {
        const [link] = await db
          .select()
          .from(walletLinks)
          .where(
            and(
              eq(walletLinks.userId, user.id),
              eq(walletLinks.address, input.wallet),
              eq(walletLinks.network, "eip155"),
            ),
          )
          .limit(1);
        if (!link) throw new ApiError(403, "Verify this EVM wallet first.");
        await findGrailToken(input.chainId, input.buyToken);
        if (input.action === "balances")
          return Response.json(
            await evmBalances(input.chainId, input.wallet, input.buyToken),
          );
        if (input.action === "resume") {
          const rows = await db
            .select()
            .from(orders)
            .where(
              and(
                eq(orders.userId, user.id),
                sql`(${orders.createdAt} > ${new Date(Date.now() - 7 * 86400000)} OR ${orders.state} IN ('awaiting_signature','pending','reconciliation_required'))`,
              ),
            );
          return Response.json({
            orders: rows
              .filter((row) => {
                const d = row.data as OrderData;
                return (
                  d.kind === "grail-direct" &&
                  d.quote.wallet === input.wallet &&
                  d.quote.buyToken === input.buyToken &&
                  d.quote.chainId === input.chainId
                );
              })
              .sort((a, b) => {
                const pending = [
                  "awaiting_signature",
                  "pending",
                  "reconciliation_required",
                ];
                return (
                  Number(pending.includes(b.state)) -
                    Number(pending.includes(a.state)) ||
                  b.createdAt.getTime() - a.createdAt.getTime()
                );
              })
              .slice(0, 10)
              .map(view),
          });
        }
        const market = await grailMarket(input.chainId, input.buyToken),
          spend = grailSpend(input.amount, market);
        const key = `grail:${user.id}:${input.idempotencyKey}`;
        const [prior] = await db
          .select()
          .from(orders)
          .where(
            and(eq(orders.idempotencyKey, key), eq(orders.userId, user.id)),
          )
          .limit(1);
        if (prior) {
          const d = prior.data as OrderData;
          if (
            d.kind !== "grail-direct" ||
            d.quote.wallet !== input.wallet ||
            d.quote.buyToken !== input.buyToken ||
            d.quote.chainId !== input.chainId ||
            d.quote.sellAmount !== spend.toString() ||
            d.quote.slippageBps !== input.slippageBps
          )
            throw new ApiError(
              409,
              "Idempotency key already used for another quote.",
            );
          return Response.json(view(prior));
        }
        const unresolved = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.userId, user.id),
              inArray(orders.state, [
                "pending",
                "awaiting_signature",
                "reconciliation_required",
                "prepared",
              ]),
            ),
          )
          .limit(100);
        if (
          unresolved.some((r) => {
            const d = r.data as OrderData;
            return (
              d.kind === "grail-direct" &&
              (r.state !== "prepared" ||
                Date.parse(d.quote.expiresAt) > Date.now()) &&
              d.quote.wallet === input.wallet &&
              d.quote.chainId === input.chainId
            );
          })
        )
          throw new ApiError(
            409,
            "A purchase or approval for this token is still pending. Refresh balances and check the existing order first.",
          );
        const recent = await db
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.userId, user.id),
              gt(orders.createdAt, new Date(Date.now() - 60000)),
            ),
          )
          .limit(10);
        if (recent.length >= 10)
          throw new ApiError(429, "Too many quotes. Wait a minute and retry.");
        const quote = await quoteGrail({
          ...input,
          sellAmount: spend.toString(),
        });
        const [row] = await db
          .insert(orders)
          .values({
            userId: user.id,
            idempotencyKey: key,
            state: "quoted",
            data: {
              kind: "grail-direct",
              quote,
            } satisfies OrderData,
          })
          .onConflictDoNothing()
          .returning();
        if (!row)
          throw new ApiError(
            409,
            "Quote request already exists. Retry with the same request key.",
          );
        await db.insert(auditEvents).values({
          userId: user.id,
          action: "grail.quote",
          data: {
            orderId: row.id,
            chainId: input.chainId,
            wallet: input.wallet,
            sellAmount: quote.sellAmount,
          },
        });
        return Response.json(view(row));
      }
      const conditions = and(
        eq(orders.id, input.id),
        eq(orders.userId, user.id),
      );
      const [row] = await db.select().from(orders).where(conditions).limit(1);
      if (!row || (row.data as OrderData).kind !== "grail-direct")
        throw new ApiError(404, "Trade not found.");
      const data = row.data as OrderData,
        q = data.quote;
      if (input.action === "status" || input.action === "broadcasted") {
        if (input.action === "broadcasted") {
          if (
            !data.prepared ||
            ![
              "awaiting_signature",
              "pending",
              "reconciliation_required",
            ].includes(row.state)
          )
            throw new ApiError(
              409,
              "This order is not awaiting a transaction.",
            );
          if (data.transactionHash && data.transactionHash !== input.hash)
            throw new ApiError(
              409,
              "An existing transaction is already tracked.",
            );
          const client = await checkedClient(q.chainId);
          assertGrailTransaction(
            data.prepared,
            await client.getTransaction({ hash: input.hash as `0x${string}` }),
          );
          const [updated] = await db
            .update(orders)
            .set({
              state: "pending",
              data: { ...data, transactionHash: input.hash },
            })
            .where(and(conditions, eq(orders.state, row.state)))
            .returning();
          if (updated)
            await db.insert(auditEvents).values({
              userId: user.id,
              action: "grail.broadcasted",
              data: { orderId: row.id, hash: input.hash },
            });
          return Response.json(view(updated ?? row));
        }
        if (
          !data.transactionHash ||
          !data.prepared ||
          !["pending", "reconciliation_required"].includes(row.state)
        )
          return Response.json(view(row));
        try {
          const result = await checkGrailTrade(
            q,
            data.prepared,
            data.transactionHash as `0x${string}`,
          );
          const [updated] = await db
            .update(orders)
            .set({ state: result.state, data: { ...data, ...result } })
            .where(and(conditions, eq(orders.state, row.state)))
            .returning();
          if (updated && result.state !== row.state)
            await db.insert(auditEvents).values({
              userId: user.id,
              action: `grail.${result.state}`,
              data: { orderId: row.id, ...result },
            });
          return Response.json(view(updated ?? row));
        } catch {
          return Response.json({
            ...view(row),
            blocker:
              "Confirmation is unavailable. Keep this order pending and check again; do not send another transaction.",
          });
        }
      }
      if (input.action === "rejected") {
        // Only called for an explicit EIP-1193 user rejection, never a timeout.
        if (row.state !== "awaiting_signature" || data.transactionHash)
          return Response.json(view(row));
        const [updated] = await db
          .update(orders)
          .set({ state: "cancelled" })
          .where(and(conditions, eq(orders.state, "awaiting_signature")))
          .returning();
        await db.insert(auditEvents).values({
          userId: user.id,
          action: "grail.wallet_rejected",
          data: { orderId: row.id },
        });
        return Response.json(view(updated ?? row));
      }
      const blocked = grailReleaseBlocker(q.wallet, q.chainId);
      if (blocked) throw new ApiError(403, blocked);
      if (Date.parse(q.expiresAt) < Date.now() + 15000)
        throw new ApiError(409, "Quote expired. Request a fresh quote.");
      if (input.action === "signing") {
        const [claimed] = await db
          .update(orders)
          .set({ state: "awaiting_signature" })
          .where(and(conditions, eq(orders.state, "prepared")))
          .returning();
        if (!claimed)
          throw new ApiError(
            409,
            "This transaction is already awaiting a wallet result. Check its status.",
          );
        await db.insert(auditEvents).values({
          userId: user.id,
          action: "grail.wallet_prompt",
          data: { orderId: row.id },
        });
        return Response.json(view(claimed));
      }
      if (row.state !== "quoted") return Response.json(view(row));
      const prepared = await prepareGrail(q);
      const updated = await db.transaction(async (tx) => {
        // All assets on the same wallet/chain share one nonce sequence.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${q.chainId}:${q.wallet}`}))`,
        );
        const pending = await tx
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.userId, user.id),
              inArray(orders.state, [
                "prepared",
                "awaiting_signature",
                "pending",
                "reconciliation_required",
              ]),
            ),
          );
        if (
          pending.some((r) => {
            const d = r.data as OrderData;
            return (
              d.kind === "grail-direct" &&
              d.quote.chainId === q.chainId &&
              d.quote.wallet === q.wallet &&
              (r.state !== "prepared" ||
                Date.parse(d.quote.expiresAt) > Date.now())
            );
          })
        )
          throw new ApiError(
            409,
            "An action for this wallet is still pending. Open recent orders and check its status.",
          );
        const [saved] = await tx
          .update(orders)
          .set({ state: "prepared", data: { ...data, prepared } })
          .where(and(conditions, eq(orders.state, "quoted")))
          .returning();
        if (!saved) throw new ApiError(409, "Order was already prepared.");
        await tx.insert(auditEvents).values({
          userId: user.id,
          action: "grail.prepared",
          data: {
            orderId: row.id,
            action: prepared.action,
            nonce: prepared.transaction.nonce,
          },
        });
        return saved;
      });
      return Response.json(view(updated));
    } catch (error) {
      if (error instanceof EvmTradingError)
        throw new ApiError(422, error.message);
      throw error;
    }
  });
}
