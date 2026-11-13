import { z } from "zod";
import {
  getDb,
  webhookDeliveries,
  onchainEvents,
  orderItems,
  orders,
  walletLinks,
  auditEvents,
  eq,
  and,
} from "@collectible/db";
import {
  confirmSolanaTransaction,
  reconcileAssetOwner,
  solanaNetwork,
} from "@collectible/integrations";
const envelope = z.object({
  transactions: z
    .array(
      z.object({
        signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/),
        mint: z.string().min(32).max(44),
      }),
    )
    .max(500),
});
function records(payload: unknown) {
  const root = payload as { data?: unknown[] };
  const batches = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.data)
      ? root.data
      : [payload];
  return batches.flatMap((b) => envelope.parse(b).transactions);
}
export async function processWebhookDelivery() {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const job = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.state, "pending"))
      .limit(1)
      .for("update", { skipLocked: true });
    if (row)
      await tx
        .update(webhookDeliveries)
        .set({ state: "working" })
        .where(eq(webhookDeliveries.nonce, row.nonce));
    return row;
  });
  if (!job) return;
  try {
    let requiresRecovery = false;
    for (const record of records(job.data)) {
      const confirmation = await confirmSolanaTransaction(record.signature);
      let state = confirmation.state;
      const [item] = await db
        .select({
          id: orderItems.id,
          userId: orders.userId,
          state: orderItems.state,
          data: orderItems.data,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(
          and(
            eq(orderItems.signature, record.signature),
            eq(orderItems.mint, record.mint),
          ),
        )
        .limit(1);
      if (!confirmation.confirmed) {
        state = "reconciliation_required";
        requiresRecovery = true;
      } else if (item) {
        const owner = (item.data as { expectedWallet?: string }).expectedWallet;
        const [link] = owner
          ? await db
              .select()
              .from(walletLinks)
              .where(
                and(
                  eq(walletLinks.address, owner),
                  eq(walletLinks.userId, item.userId),
                ),
              )
              .limit(1)
          : [];
        if (!owner || !link) {
          state = "reconciliation_required";
          requiresRecovery = true;
        } else {
          const ownership = await reconcileAssetOwner(record.mint, owner);
          if (ownership.verified) {
            state = "owner_verified";
            await db.transaction(async (tx) => {
              await tx
                .update(orderItems)
                .set({
                  state: "owner_verified",
                  data: { ...(item.data as object), ownership, confirmation },
                })
                .where(
                  and(
                    eq(orderItems.id, item.id),
                    eq(orderItems.signature, record.signature),
                  ),
                );
              await tx.insert(auditEvents).values({
                userId: item.userId,
                action: "purchase.owner.reconciled",
                data: {
                  itemId: item.id,
                  mint: record.mint,
                  signature: record.signature,
                },
              });
            });
          } else {
            state = "reconciliation_required";
            requiresRecovery = true;
          }
        }
      }
      await db
        .insert(onchainEvents)
        .values({
          signature: record.signature,
          network: solanaNetwork(),
          state,
          data: { mint: record.mint, confirmation, appOrderTracked: !!item },
        })
        .onConflictDoUpdate({
          target: onchainEvents.signature,
          set: {
            state,
            data: { mint: record.mint, confirmation, appOrderTracked: !!item },
          },
        });
    }
    await db
      .update(webhookDeliveries)
      .set({
        state: requiresRecovery ? "reconciliation_required" : "processed",
      })
      .where(eq(webhookDeliveries.nonce, job.nonce));
  } catch {
    await db
      .update(webhookDeliveries)
      .set({ state: "reconciliation_required" })
      .where(eq(webhookDeliveries.nonce, job.nonce));
  }
}
