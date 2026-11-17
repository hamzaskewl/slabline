import { getSignatureFromTransaction } from "@solana/kit";
import { timingSafeEqual } from "node:crypto";
import {
  getDb,
  orders,
  orderItems,
  walletLinks,
  auditEvents,
  eq,
  and,
  gt,
  inArray,
  sql,
} from "@collectible/db";
import {
  units,
  assertFreshListing,
  type Listing,
  type CcTestView,
} from "@collectible/domain";
import { listCards } from "./catalog";
import {
  ccPurchaseContext,
  buildDirectCcDevnetDraft,
  inspectCcTransaction,
  simulateCcPurchase,
  decodeCoreOwner,
  type CcContext,
} from "./collector-crypt-inspection";
import { solanaNetwork, solanaRpc, confirmSolanaTransaction } from "./solana";
import { address, blockhash } from "@solana/kit";

export class CcPurchaseError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type Prepared = {
  context: CcContext;
  draft: Awaited<ReturnType<typeof buildDirectCcDevnetDraft>>;
  simulation: Awaited<ReturnType<typeof simulateCcPurchase>>;
};
export async function inspectAndPrepareCcPurchase(
  card: Listing,
  wallet: string,
): Promise<Prepared> {
  assertFreshListing(card);
  if (card.network !== "devnet")
    throw new CcPurchaseError("Mainnet card purchases remain disabled.", 403);
  const context = await ccPurchaseContext(card, wallet),
    draft = await buildDirectCcDevnetDraft(context);
  return {
    context,
    draft,
    simulation: await simulateCcPurchase(draft.unsignedBase64, context),
  };
}
type Data = {
  kind: "collectorcrypt-devnet";
  wallet: string;
  mint: string;
  card?: Listing;
  prepared?: Prepared;
  expiresAt?: string;
  signedBase64?: string;
  signature?: string;
  attempts?: number;
  lastAttempt?: string;
  ownership?: CcTestView["ownership"];
  checkedAt?: string;
  error?: string;
};
type Row = typeof orders.$inferSelect;
export function ccSigningBlocker(wallet: string) {
  if (solanaNetwork() !== "devnet")
    return "Devnet purchase tests require the devnet network.";
  if (
    process.env.ENABLE_CC_DEVNET_TESTS !== "true" ||
    process.env.CC_DEVNET_TEST_WALLET !== wallet
  )
    return "Signing is off until a funded test wallet and a user-approved devnet test are configured.";
  return null;
}
export function ccTestView(row: Row): CcTestView {
  const d = row.data as Data,
    expired = !!d.expiresAt && Date.parse(d.expiresAt) <= Date.now(),
    blocker = ccSigningBlocker(d.wallet);
  return {
    id: row.id,
    network: "devnet",
    state: expired && row.state === "prepared" ? "expired" : row.state,
    card: d.card ?? null,
    wallet: d.wallet,
    canSign:
      !blocker &&
      !expired &&
      !!d.prepared &&
      !!d.expiresAt &&
      row.state === "prepared",
    canRetry:
      !blocker &&
      row.state === "reconciliation_required" &&
      !!d.signature &&
      !!d.signedBase64 &&
      (d.attempts ?? 0) < 2,
    blocker,
    expiresAt: d.expiresAt ?? null,
    ...(d.prepared &&
    !blocker &&
    !expired &&
    ["prepared", "awaiting_signature"].includes(row.state)
      ? { unsignedBase64: d.prepared.draft.unsignedBase64 }
      : {}),
    signature: d.signature ?? null,
    simulation: d.prepared
      ? {
          source: "solana_simulation",
          feeLamports: d.prepared.simulation.feeLamports,
          totalSolCostLamports: d.prepared.simulation.totalSolCostLamports,
          priceBaseUnits: d.prepared.simulation.priceBaseUnits,
          platformFeeBaseUnits: d.prepared.simulation.platformFeeBaseUnits,
          slot: d.prepared.simulation.slot,
          moneyMoved: false,
        }
      : null,
    ownership: d.ownership ?? null,
    error: d.error ?? null,
  };
}
export async function ownedCcTest(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.userId, userId)))
    .limit(1);
  if (!row || (row.data as Data).kind !== "collectorcrypt-devnet")
    throw new CcPurchaseError("Card test not found.", 404);
  return row;
}
async function verifyWallet(userId: string, wallet: string) {
  address(wallet);
  const [link] = await getDb()
    .select()
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.userId, userId),
        eq(walletLinks.address, wallet),
        eq(walletLinks.network, "devnet"),
      ),
    )
    .limit(1);
  if (!link)
    throw new CcPurchaseError("Verify your devnet Solana wallet first.", 403);
}
export async function prepareCcTest(
  userId: string,
  wallet: string,
  mint: string,
  idempotencyKey: string,
  dependencies?: {
    prepare?: (card: Listing, wallet: string) => Promise<Prepared>;
    cards?: (mint: string) => Promise<Listing[]>;
  },
): Promise<CcTestView> {
  if (solanaNetwork() !== "devnet")
    throw new CcPurchaseError("This test is available on devnet only.", 403);
  address(mint);
  await verifyWallet(userId, wallet);
  const db = getDb(),
    key = `cc-devnet:${userId}:${idempotencyKey}`;
  const claim = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`cc-devnet:${wallet}`}))`,
    );
    const [prior] = await tx
      .select()
      .from(orders)
      .where(eq(orders.idempotencyKey, key))
      .limit(1);
    if (prior) {
      const d = prior.data as Data;
      if (
        d.wallet !== wallet ||
        d.mint !== mint ||
        d.kind !== "collectorcrypt-devnet"
      )
        throw new CcPurchaseError(
          "Request key already used for another card or wallet.",
          409,
        );
      if (prior.state === "building")
        if (Date.now() - prior.createdAt.getTime() < 90000)
          throw new CcPurchaseError(
            "This card test is already being prepared.",
            409,
          );
        else {
          const [failed] = await tx
            .update(orders)
            .set({
              state: "failed",
              data: {
                ...d,
                error: "Preparation was interrupted. Prepare a new card test.",
              },
            })
            .where(eq(orders.id, prior.id))
            .returning();
          await tx
            .update(orderItems)
            .set({ state: "failed" })
            .where(eq(orderItems.orderId, prior.id));
          return { row: failed!, created: false };
        }
      return { row: prior, created: false };
    }
    const pending = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          inArray(orders.state, [
            "awaiting_signature",
            "broadcast",
            "reconciliation_required",
          ]),
        ),
      )
      .limit(100);
    if (
      pending.some(
        (r) =>
          (r.data as Data).kind === "collectorcrypt-devnet" &&
          (r.data as Data).wallet === wallet,
      )
    )
      throw new CcPurchaseError(
        "Check or cancel your previous card test before preparing another.",
        409,
      );
    const recent = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          gt(orders.createdAt, new Date(Date.now() - 60000)),
          sql`${orders.data}->>'kind'='collectorcrypt-devnet'`,
        ),
      )
      .limit(5);
    if (recent.length >= 5)
      throw new CcPurchaseError(
        "Wait a minute before preparing more card tests.",
        429,
      );
    const [row] = await tx
      .insert(orders)
      .values({
        userId,
        idempotencyKey: key,
        state: "building",
        data: { kind: "collectorcrypt-devnet", wallet, mint } satisfies Data,
      })
      .returning();
    await tx.insert(orderItems).values({
      orderId: row!.id,
      mint,
      state: "building",
      data: { network: "devnet" },
    });
    await tx.insert(auditEvents).values({
      userId,
      action: "cc.devnet.prepare.requested",
      data: { id: row!.id, mint },
    });
    return { row: row!, created: true };
  });
  if (!claim.created) return ccTestView(claim.row);
  try {
    const cards = await (dependencies?.cards
        ? dependencies.cards(mint)
        : listCards(mint, [], "devnet")),
      card = cards.find((c) => c.mint === mint);
    if (!card || units(card.ask) > units("1000"))
      throw new CcPurchaseError(
        "No supported devnet listing under 1,000 test USDC was returned.",
      );
    const prepared = dependencies?.prepare
      ? await dependencies.prepare(card, wallet)
      : await inspectAndPrepareCcPurchase(card, wallet);
    const data: Data = {
      kind: "collectorcrypt-devnet",
      wallet,
      mint,
      card,
      prepared,
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    };
    const row = await db.transaction(async (tx) => {
      const [r] = await tx
        .update(orders)
        .set({ state: "prepared", data })
        .where(and(eq(orders.id, claim.row.id), eq(orders.state, "building")))
        .returning();
      if (!r)
        throw new CcPurchaseError(
          "Card test was cancelled; prepare a new one.",
          409,
        );
      await tx
        .update(orderItems)
        .set({ state: "awaiting_signature" })
        .where(eq(orderItems.orderId, r.id));
      await tx.insert(auditEvents).values({
        userId,
        action: "cc.devnet.simulation.passed",
        data: { id: r.id, slot: prepared.simulation.slot, moneyMoved: false },
      });
      return r;
    });
    return ccTestView(row);
  } catch (error) {
    const message =
      error instanceof Error &&
      !/https?:|secret|password|token=/i.test(error.message)
        ? error.message
        : "Devnet preparation failed. No transaction was sent.";
    const [row] = await db
      .update(orders)
      .set({
        state: "failed",
        data: {
          kind: "collectorcrypt-devnet",
          wallet,
          mint,
          error: message,
        } satisfies Data,
      })
      .where(and(eq(orders.id, claim.row.id), eq(orders.state, "building")))
      .returning();
    if (row)
      await db
        .update(orderItems)
        .set({ state: "failed" })
        .where(eq(orderItems.orderId, row.id));
    await db.insert(auditEvents).values({
      userId,
      action: "cc.devnet.prepare.failed",
      data: { id: claim.row.id },
    });
    return ccTestView(row ?? (await ownedCcTest(userId, claim.row.id)));
  }
}
async function signable(userId: string, row: Row) {
  const d = row.data as Data,
    blocked = ccSigningBlocker(d.wallet);
  if (blocked) throw new CcPurchaseError(blocked, 403);
  await verifyWallet(userId, d.wallet);
  if (!d.prepared || !d.expiresAt || Date.parse(d.expiresAt) <= Date.now())
    throw new CcPurchaseError(
      "The purchase review expired. Prepare a new test.",
      409,
    );
  const inspected = inspectCcTransaction(
    d.prepared.draft.unsignedBase64,
    d.prepared.context,
  );
  const valid = await solanaRpc("devnet")
    .isBlockhashValid(blockhash(inspected.blockhash), {
      commitment: "confirmed",
    })
    .send({ abortSignal: AbortSignal.timeout(15000) });
  if (!valid.value)
    throw new CcPurchaseError(
      "Transaction blockhash expired. Prepare a new test.",
      409,
    );
  return d;
}
export async function beginCcSigning(userId: string, id: string) {
  const row = await ownedCcTest(userId, id);
  await signable(userId, row);
  const claimed = await getDb().transaction(async (tx) => {
    const wallet = (row.data as Data).wallet;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`cc-devnet:${wallet}`}))`,
    );
    const pending = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          inArray(orders.state, [
            "awaiting_signature",
            "broadcast",
            "reconciliation_required",
          ]),
        ),
      );
    if (
      pending.some(
        (r) =>
          r.id !== id &&
          (r.data as Data).kind === "collectorcrypt-devnet" &&
          (r.data as Data).wallet === wallet,
      )
    )
      throw new CcPurchaseError(
        "Another card test is still signing or confirming.",
        409,
      );
    return (
      await tx
        .update(orders)
        .set({ state: "awaiting_signature" })
        .where(and(eq(orders.id, id), eq(orders.state, "prepared")))
        .returning()
    )[0];
  });
  if (!claimed)
    throw new CcPurchaseError(
      "This test is already signing or submitted.",
      409,
    );
  await getDb()
    .insert(auditEvents)
    .values({ userId, action: "cc.devnet.signing.requested", data: { id } });
  return ccTestView(claimed);
}
export async function cancelCcTest(userId: string, id: string) {
  await ownedCcTest(userId, id);
  const [row] = await getDb()
    .update(orders)
    .set({ state: "cancelled" })
    .where(
      and(
        eq(orders.id, id),
        inArray(orders.state, ["building", "prepared", "awaiting_signature"]),
      ),
    )
    .returning();
  if (!row)
    throw new CcPurchaseError(
      "Submitted transactions require reconciliation and cannot be cancelled.",
      409,
    );
  await getDb()
    .update(orderItems)
    .set({ state: "failed" })
    .where(eq(orderItems.orderId, id));
  await getDb()
    .insert(auditEvents)
    .values({ userId, action: "cc.devnet.cancelled", data: { id } });
  return ccTestView(row);
}
export async function submitCcTest(
  userId: string,
  id: string,
  signedBase64: string,
) {
  const row = await ownedCcTest(userId, id);
  if (row.state !== "awaiting_signature") return ccTestView(row);
  const d = await signable(userId, row);
  const signed = inspectCcTransaction(signedBase64, d.prepared!.context, true),
    expected = Buffer.from(d.prepared!.simulation.messageBase64, "base64"),
    actual = Buffer.from(signed.transaction.messageBytes);
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual))
    throw new CcPurchaseError("The wallet changed the reviewed transaction.");
  const signature = getSignatureFromTransaction(signed.transaction);
  const data: Data = {
    ...d,
    signedBase64,
    signature,
    attempts: 1,
    lastAttempt: new Date().toISOString(),
  };
  const [claimed] = await getDb()
    .update(orders)
    .set({ state: "broadcast", data })
    .where(and(eq(orders.id, id), eq(orders.state, "awaiting_signature")))
    .returning();
  if (!claimed) return ccTestView(await ownedCcTest(userId, id));
  await getDb()
    .update(orderItems)
    .set({ state: "broadcast", signature })
    .where(eq(orderItems.orderId, id));
  await getDb().insert(auditEvents).values({
    userId,
    action: "cc.devnet.broadcast.requested",
    data: { id, signature },
  });
  return broadcastStoredCcTest(userId, id, data);
}
async function broadcastStoredCcTest(userId: string, id: string, data: Data) {
  const { wallet, signedBase64, signature } = data;
  if (!signedBase64 || !signature || ccSigningBlocker(wallet))
    throw new CcPurchaseError(
      "Devnet broadcast is not enabled for this wallet.",
      403,
    );
  try {
    const response = await fetch(
      "https://dev-api.collectorcrypt.com/marketplace/broadcast",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "CollectibleMarkets/1.0",
        },
        body: JSON.stringify({
          wallet,
          signedTransaction: signedBase64,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    const body = (await response.json()) as {
      success?: boolean;
      signature?: string;
    };
    if (!response.ok || body.signature !== signature || body.success !== true)
      throw new Error("Broadcast response requires reconciliation");
  } catch {
    await getDb()
      .update(orders)
      .set({
        state: "reconciliation_required",
        data: {
          ...data,
          error:
            "Broadcast outcome is unknown. Check the saved signature; do not submit a new purchase.",
        },
      })
      .where(eq(orders.id, id));
  }
  return checkCcTest(userId, id);
}
export async function retryCcTest(userId: string, id: string) {
  let row = await ownedCcTest(userId, id);
  const current = await checkCcTest(userId, id);
  if (current.state !== "reconciliation_required") return current;
  row = await ownedCcTest(userId, id);
  const d = row.data as Data;
  if (
    !ccTestView(row).canRetry ||
    !d.prepared ||
    !d.signedBase64 ||
    !d.signature
  )
    throw new CcPurchaseError("This submission cannot be retried.", 409);
  await verifyWallet(userId, d.wallet);
  if (d.lastAttempt && Date.now() - Date.parse(d.lastAttempt) < 15000)
    throw new CcPurchaseError(
      "Wait 15 seconds before retrying the saved transaction.",
      429,
    );
  const valid = await solanaRpc("devnet")
    .isBlockhashValid(
      blockhash(
        inspectCcTransaction(d.signedBase64, d.prepared.context, true)
          .blockhash,
      ),
      { commitment: "confirmed" },
    )
    .send({ abortSignal: AbortSignal.timeout(15000) });
  if (!valid.value)
    throw new CcPurchaseError(
      "The signed transaction expired. Reconcile the saved signature before preparing a replacement.",
      409,
    );
  const data: Data = {
    ...d,
    attempts: (d.attempts ?? 1) + 1,
    lastAttempt: new Date().toISOString(),
  };
  const [claimed] = await getDb()
    .update(orders)
    .set({ state: "broadcast", data })
    .where(
      and(
        eq(orders.id, id),
        eq(orders.state, "reconciliation_required"),
        sql`${orders.data}->>'lastAttempt'=${d.lastAttempt ?? ""}`,
      ),
    )
    .returning();
  if (!claimed) return ccTestView(await ownedCcTest(userId, id));
  await getDb()
    .insert(auditEvents)
    .values({
      userId,
      action: "cc.devnet.broadcast.retry",
      data: { id, signature: d.signature, attempt: data.attempts },
    });
  return broadcastStoredCcTest(userId, id, data);
}
export async function checkCcTest(userId: string, id: string) {
  const row = await ownedCcTest(userId, id),
    d = row.data as Data;
  if (!d.signature || !d.prepared || row.state === "owner_verified")
    return ccTestView(row);
  if (d.checkedAt && Date.now() - Date.parse(d.checkedAt) < 5000)
    return ccTestView(row);
  const status = await confirmSolanaTransaction(d.signature);
  let state = row.state,
    error = d.error,
    ownership = d.ownership;
  if (status.state === "failed") {
    state = "failed";
    error = "The devnet transaction failed onchain.";
  } else if (status.confirmed) {
    const result = await solanaRpc("devnet")
      .getAccountInfo(address(d.mint), {
        encoding: "base64",
        commitment: "confirmed",
        ...(status.slot ? { minContextSlot: BigInt(status.slot) } : {}),
      })
      .send({ abortSignal: AbortSignal.timeout(15000) });
    if (result.value) {
      const asset = decodeCoreOwner({
        owner: result.value.owner,
        data: Buffer.from(result.value.data[0], "base64"),
      });
      ownership = {
        owner: asset.owner,
        verified:
          asset.owner === d.wallet &&
          asset.collection === d.prepared.context.collection,
        source: "core_rpc",
        slot: result.context.slot.toString(),
      };
      state = ownership.verified ? "owner_verified" : "confirmed";
      error = ownership.verified
        ? undefined
        : "Transaction confirmed; card ownership has not matched the buyer yet.";
    }
  }
  const [saved] = await getDb()
    .update(orders)
    .set({
      state,
      data: { ...d, error, ownership, checkedAt: new Date().toISOString() },
    })
    .where(and(eq(orders.id, id), eq(orders.userId, userId)))
    .returning();
  await getDb()
    .update(orderItems)
    .set({
      state:
        state === "owner_verified"
          ? "owner_verified"
          : state === "failed"
            ? "failed"
            : status.confirmed
              ? "confirmed"
              : "broadcast",
    })
    .where(eq(orderItems.orderId, id));
  if (state !== row.state)
    await getDb()
      .insert(auditEvents)
      .values({
        userId,
        action: `cc.devnet.${state}`,
        data: { id, signature: d.signature },
      });
  return ccTestView(saved!);
}
