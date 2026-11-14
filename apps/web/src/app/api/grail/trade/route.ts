import { z } from "zod";
import { parseUnits } from "viem";
import {
  getDb,
  orders,
  walletLinks,
  auditEvents,
  eq,
  and,
  gt,
  inArray,
} from "@collectible/db";
import {
  evmAddress,
  evmChainId,
  evmHash,
  type GrailQuote,
  type GrailOrderView,
} from "@collectible/domain";
import {
  quoteGrail,
  grailReleaseBlocker,
  submitGrail,
  checkGrailTrade,
  verifyEvmTrade,
  assertSettler,
  evmClient,
  evmBalances,
  findGrailToken,
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
  kind: "grail";
  quote: GrailQuote;
  tradeHash: string;
  approvalHash?: string;
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
    amount: z.string().regex(/^\d+(\.\d{1,6})?$/),
    slippageBps: z.number().int().min(30).max(100),
    idempotencyKey: z.string().uuid(),
  }),
  z.object({ action: z.literal("balances"), ...selection }),
  z.object({ action: z.literal("resume"), ...selection }),
  z.object({
    action: z.literal("submit"),
    id: z.string().uuid(),
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  }),
  z.object({ action: z.literal("status"), id: z.string().uuid() }),
  z.object({ action: z.literal("approval"), id: z.string().uuid() }),
  z.object({
    action: z.literal("approval_sent"),
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
                gt(orders.createdAt, new Date(Date.now() - 7 * 86400000)),
              ),
            );
          return Response.json({
            orders: rows
              .filter((row) => {
                const d = row.data as OrderData;
                return (
                  d.kind === "grail" &&
                  d.quote.wallet === input.wallet &&
                  d.quote.buyToken === input.buyToken &&
                  d.quote.chainId === input.chainId
                );
              })
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .slice(0, 10)
              .map(view),
          });
        }
        const spend = parseUnits(input.amount, 6),
          max = parseUnits(process.env.GRAIL_MAX_TRADE_AMOUNT ?? "25", 6);
        if (spend <= 0n || spend > max)
          throw new ApiError(
            400,
            `Amount must be greater than zero and no more than ${process.env.GRAIL_MAX_TRADE_AMOUNT ?? "25"}.`,
          );
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
            d.kind !== "grail" ||
            d.quote.wallet !== input.wallet ||
            d.quote.buyToken !== input.buyToken ||
            d.quote.chainId !== input.chainId ||
            d.quote.sellAmount !== spend.toString()
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
                "submitting",
                "reconciliation_required",
                "approval_pending",
              ]),
            ),
          )
          .limit(100);
        if (
          unresolved.some((r) => {
            const d = r.data as OrderData;
            return (
              d.kind === "grail" &&
              d.quote.wallet === input.wallet &&
              d.quote.chainId === input.chainId &&
              d.quote.buyToken === input.buyToken
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
              kind: "grail",
              quote,
              tradeHash: quote.trade.hash,
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
      if (!row || (row.data as OrderData).kind !== "grail")
        throw new ApiError(404, "Trade not found.");
      const data = row.data as OrderData,
        q = data.quote;
      if (input.action === "status") {
        if (
          ["confirmed", "failed", "quoted", "approval_confirmed"].includes(
            row.state,
          )
        )
          return Response.json(view(row));
        if (data.approvalHash && row.state === "approval_pending") {
          const receipt = await evmClient(q.chainId).getTransactionReceipt({
            hash: data.approvalHash as `0x${string}`,
          });
          const state =
            receipt.status === "success" ? "approval_confirmed" : "failed";
          const [updated] = await db
            .update(orders)
            .set({ state })
            .where(and(conditions, eq(orders.state, "approval_pending")))
            .returning();
          return Response.json(view(updated ?? row));
        }
        try {
          const result = await checkGrailTrade(q, data.tradeHash);
          if (result.state === "pending") return Response.json(view(row));
          const [updated] = await db
            .update(orders)
            .set({ state: result.state, data: { ...data, ...result } })
            .where(and(conditions, eq(orders.state, row.state)))
            .returning();
          if (updated)
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
              "Confirmation is unavailable. This order remains pending; do not submit another purchase.",
          });
        }
      }
      if (input.action === "approval_sent") {
        if (row.state !== "quoted" || !q.approvalTransaction)
          return Response.json(view(row));
        const client = evmClient(q.chainId),
          tx = await client.getTransaction({
            hash: input.hash as `0x${string}`,
          });
        if (
          (await client.getChainId()) !== q.chainId ||
          tx.from.toLowerCase() !== q.wallet ||
          tx.to?.toLowerCase() !== q.approvalTransaction.to ||
          tx.input.toLowerCase() !== q.approvalTransaction.data.toLowerCase() ||
          tx.value !== 0n
        )
          throw new ApiError(
            400,
            "Approval transaction does not match this order.",
          );
        const [updated] = await db
          .update(orders)
          .set({
            state: "approval_pending",
            data: { ...data, approvalHash: input.hash },
          })
          .where(and(conditions, eq(orders.state, "quoted")))
          .returning();
        return Response.json(view(updated ?? row));
      }
      const blocked = grailReleaseBlocker(q.wallet, q.chainId);
      if (blocked) throw new ApiError(403, blocked);
      if (row.state !== "quoted") return Response.json(view(row));
      if (Date.parse(q.expiresAt) <= Date.now())
        throw new ApiError(409, "Quote expired. Request a new quote.");
      if (input.action === "approval") {
        if (!q.approvalTransaction)
          throw new ApiError(409, "No approval required.");
        const client = evmClient(q.chainId);
        if ((await client.getChainId()) !== q.chainId)
          throw new ApiError(503, "Wrong RPC chain.");
        const gas = await client.estimateGas({
          account: q.wallet,
          to: q.approvalTransaction.to,
          data: q.approvalTransaction.data,
          value: 0n,
        });
        const price = await client.getGasPrice();
        await db.insert(auditEvents).values({
          userId: user.id,
          action: "grail.approval.review",
          data: { orderId: row.id, amount: q.sellAmount },
        });
        return Response.json({
          transaction: q.approvalTransaction,
          estimatedGasWei: (gas * price).toString(),
          sponsored: false,
        });
      }
      if (q.approvalRequired)
        throw new ApiError(
          409,
          "Approve the exact amount and request a new quote first.",
        );
      if (!(await verifyEvmTrade(q, input.signature as `0x${string}`)))
        throw new ApiError(
          403,
          "Invalid trade signature for the selected wallet.",
        );
      await assertSettler(
        q.chainId,
        evmAddress.parse(q.trade.eip712.message.spender),
      );
      const [claimed] = await db
        .update(orders)
        .set({ state: "submitting" })
        .where(and(conditions, eq(orders.state, "quoted")))
        .returning();
      if (!claimed)
        throw new ApiError(409, "Trade is already being submitted.");
      await db.insert(auditEvents).values({
        userId: user.id,
        action: "grail.submit",
        data: { orderId: row.id, tradeHash: data.tradeHash },
      });
      try {
        const submitted = await submitGrail(
          q,
          input.signature as `0x${string}`,
        );
        const [updated] = await db
          .update(orders)
          .set({
            state: "pending",
            data: { ...data, tradeHash: submitted.tradeHash },
          })
          .where(and(conditions, eq(orders.state, "submitting")))
          .returning();
        return Response.json(view(updated ?? claimed));
      } catch {
        const [updated] = await db
          .update(orders)
          .set({ state: "reconciliation_required" })
          .where(and(conditions, eq(orders.state, "submitting")))
          .returning();
        return Response.json({
          ...view(updated ?? claimed),
          blocker:
            "Submission result is unknown. Check this order’s status before making another purchase.",
        });
      }
    } catch (error) {
      if (error instanceof EvmTradingError)
        throw new ApiError(422, error.message);
      throw error;
    }
  });
}
