import { randomUUID } from "node:crypto";
import {
  getDb,
  withdrawals,
  fundingIntents,
  eq,
  and,
  sql,
} from "@collectible/db";
import {
  units,
  money,
  type UsdcTransfer,
  type UsdcTransferAccount,
} from "@collectible/domain";
import { DemoError, lockedDemoAccount, requireDemoNetwork } from "./demo";
import { requireDemoWallet, inspectDemoMintSignature } from "./demo-nft";
import { solanaNetwork } from "./solana";
import {
  devnetUsdcChain,
  type UsdcChain,
  type TransferDraft,
  type TransferInput,
} from "./devnet-usdc-chain";

type Data = TransferDraft &
  TransferInput & { signedBase64?: string; attempts: number };
type Row = typeof withdrawals.$inferSelect;
const prefix = "demo:usdc:";
const terminal = (state: string) =>
  ["confirmed", "refunded", "expired"].includes(state);
function view(row: Row): UsdcTransfer {
  const d = row.data as Data;
  return {
    id: row.id,
    direction: d.direction,
    amount: d.amount,
    wallet: d.wallet,
    mint: d.mint,
    state: row.state as UsdcTransfer["state"],
    signature: d.signature,
    ...(row.state === "prepared" ? { unsignedBase64: d.unsignedBase64 } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}
export function usdcTransferAmount(value: string) {
  if (
    !/^\d{1,7}(\.\d{1,6})?$/.test(value) ||
    units(value) <= 0n ||
    units(value) > units("1000000")
  )
    throw new DemoError("Enter an amount between 0.000001 and 1,000,000 USDC.");
  return money(units(value));
}
/** Chain injection is used by isolated database tests; routes use only the devnet implementation. */
export function createUsdcTransfers(chain: UsdcChain = devnetUsdcChain) {
  async function owned(userId: string, id: string) {
    requireDemoNetwork(solanaNetwork());
    const [row] = await getDb()
      .select()
      .from(withdrawals)
      .where(
        and(
          eq(withdrawals.id, id),
          eq(withdrawals.userId, userId),
          sql`${withdrawals.idempotencyKey} like 'demo:usdc:%'`,
        ),
      );
    if (!row) throw new DemoError("Transfer not found.", 404);
    return row;
  }
  async function account(
    userId: string,
    wallet?: string,
  ): Promise<UsdcTransferAccount> {
    requireDemoNetwork(solanaNetwork());
    if (wallet) await requireDemoWallet(userId, wallet);
    const config = chain.configuration();
    const rows = await getDb()
      .select()
      .from(withdrawals)
      .where(
        and(
          eq(withdrawals.userId, userId),
          sql`${withdrawals.idempotencyKey} like 'demo:usdc:%'`,
        ),
      )
      .orderBy(sql`${withdrawals.createdAt} desc`)
      .limit(20);
    return {
      ...config,
      walletBalance:
        wallet && config.configured ? await chain.balance(wallet) : null,
      transfers: rows.map(view),
    };
  }
  async function prepare(
    userId: string,
    key: string,
    direction: TransferInput["direction"],
    wallet: string,
    rawAmount: string,
  ) {
    requireDemoNetwork(solanaNetwork());
    const amount = usdcTransferAmount(rawAmount);
    await requireDemoWallet(userId, wallet);
    const idempotencyKey = `${prefix}${userId}:${key}`;
    return getDb().transaction(async (tx) => {
      const ledger = await lockedDemoAccount(tx, userId);
      const [prior] = await tx
        .select()
        .from(withdrawals)
        .where(eq(withdrawals.idempotencyKey, idempotencyKey));
      if (prior) {
        const d = prior.data as Data;
        if (
          d.amount !== amount ||
          d.wallet !== wallet ||
          d.direction !== direction
        )
          throw new DemoError(
            "This transfer request already has different details.",
            409,
          );
        return view(prior);
      }
      const [pending] = await tx
        .select()
        .from(withdrawals)
        .where(
          and(
            eq(withdrawals.userId, userId),
            sql`${withdrawals.idempotencyKey} like 'demo:usdc:%'`,
            sql`${withdrawals.state} in ('prepared','submitted')`,
          ),
        )
        .limit(1);
      if (pending)
        throw new DemoError(
          "Finish your pending transfer below before starting another.",
          409,
        );
      const [rate] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(withdrawals)
        .where(
          and(
            eq(withdrawals.userId, userId),
            sql`${withdrawals.idempotencyKey} like 'demo:usdc:%'`,
            sql`${withdrawals.createdAt} > now() - interval '1 hour'`,
          ),
        );
      if ((rate?.count ?? 0) >= 30)
        throw new DemoError(
          "Transfer limit reached. Try again in an hour.",
          429,
        );
      if (direction === "withdraw" && units(ledger.amount) < units(amount))
        throw new DemoError(
          "Your available balance is too low for this withdrawal.",
          409,
        );
      const input = { id: randomUUID(), direction, amount, wallet };
      const draft = await chain.prepare(input);
      const [row] = await tx
        .insert(withdrawals)
        .values({
          id: input.id,
          userId,
          idempotencyKey,
          providerId: draft.signature,
          state: "prepared",
          data: { ...input, ...draft, attempts: 0 },
        })
        .returning();
      if (direction === "withdraw") {
        await tx
          .update(fundingIntents)
          .set({
            amount: money(units(ledger.amount) - units(amount)),
            version: ledger.version + 1,
          })
          .where(eq(fundingIntents.id, ledger.id));
      }
      return view(row!);
    });
  }
  async function check(userId: string, id: string) {
    const row = await owned(userId, id);
    if (terminal(row.state)) return view(row);
    const outcome = await chain.outcome(row.data as Data);
    if (outcome === "pending") return view(row);
    return getDb().transaction(async (tx) => {
      // Always lock ledger before operation, matching trading/prepare lock order.
      const ledger = await lockedDemoAccount(tx, userId);
      const [current] = await tx
        .select()
        .from(withdrawals)
        .where(eq(withdrawals.id, id))
        .for("update");
      if (!current) throw new DemoError("Transfer not found.", 404);
      if (terminal(current.state)) return view(current);
      const d = current.data as Data;
      const success = outcome === "confirmed";
      const credit =
        (success && d.direction === "deposit") ||
        (!success && d.direction === "withdraw");
      if (credit) {
        await tx
          .update(fundingIntents)
          .set({
            amount: money(units(ledger.amount) + units(d.amount)),
            version: ledger.version + 1,
          })
          .where(eq(fundingIntents.id, ledger.id));
      }
      const [updated] = await tx
        .update(withdrawals)
        .set({
          state: success
            ? "confirmed"
            : d.direction === "withdraw"
              ? "refunded"
              : "expired",
        })
        .where(eq(withdrawals.id, id))
        .returning();
      return view(updated!);
    });
  }
  async function submit(userId: string, id: string, signedBase64?: string) {
    const checked = await check(userId, id);
    if (terminal(checked.state)) return checked;
    const row = await owned(userId, id),
      d = row.data as Data;
    await requireDemoWallet(userId, d.wallet);
    const signed = signedBase64 ?? d.signedBase64;
    if (!signed)
      throw new DemoError("Approve this transfer in your wallet first.", 409);
    if (
      inspectDemoMintSignature(d.unsignedBase64, signed, d.wallet) !==
      d.signature
    )
      throw new DemoError(
        "The signed transfer does not match the saved request.",
        409,
      );
    if (d.attempts >= 5)
      throw new DemoError(
        "Check the saved transfer for confirmation or expiry.",
        409,
      );
    const [claimed] = await getDb()
      .update(withdrawals)
      .set({
        state: "submitted",
        data: { ...d, signedBase64: signed, attempts: d.attempts + 1 },
      })
      .where(
        and(
          eq(withdrawals.id, id),
          eq(withdrawals.state, row.state),
          sql`(${withdrawals.data}->>'attempts')::int = ${d.attempts}`,
        ),
      )
      .returning();
    if (claimed) {
      try {
        await chain.broadcast(signed);
      } catch {
        /* Unknown broadcast outcome: keep reservation and reconcile the saved ID. */
      }
    }
    return check(userId, id);
  }
  return { account, prepare, check, submit };
}
export const usdcTransfers = createUsdcTransfers();
