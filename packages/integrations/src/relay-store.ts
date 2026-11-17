import {
  getDb,
  relayRequests,
  walletLinks,
  auditEvents,
  eq,
  and,
  gt,
  sql,
} from "@collectible/db";
import {
  relayRoutes,
  relayInputKey,
  type RelayQuoteInput,
  type RelayQuote,
  type RelayStatus,
  type RelayRecord,
} from "@collectible/domain";
import { quoteRelay, relayStatus, RelayError } from "./relay";

type Data = {
  kind: "relay-preview";
  input: RelayQuoteInput;
  quote?: RelayQuote;
  status?: RelayStatus;
  error?: string;
};
type Row = typeof relayRequests.$inferSelect;
export function relayRecordView(row: Row, now = Date.now()): RelayRecord {
  const d = row.data as Data;
  return {
    id: row.id,
    state:
      d.quote && Date.parse(d.quote.expiresAt) <= now ? "expired" : row.state,
    quote: d.quote ?? null,
    status: d.status ?? null,
    error: d.error ?? null,
    canExecute: false,
    moneyMovedByApp: false,
  };
}
export async function ownedRelayRecord(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(relayRequests)
    .where(and(eq(relayRequests.id, id), eq(relayRequests.userId, userId)))
    .limit(1);
  if (!row || (row.data as Data).kind !== "relay-preview")
    throw new RelayError("RELAY_NOT_FOUND", "Quote not found.", 404);
  return row;
}
export async function saveRelayQuote(
  userId: string,
  input: RelayQuoteInput,
  idempotencyKey: string,
  quoteProvider = quoteRelay,
): Promise<RelayRecord> {
  const fingerprint = relayInputKey(input);
  const db = getDb(),
    key = `relay:${userId}:${idempotencyKey}`;
  const claim = await db.transaction(async (tx) => {
    // Serialize quote creation per user, including rate checks and duplicate clicks.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`relay:${userId}`}))`,
    );
    const links = await tx
      .select()
      .from(walletLinks)
      .where(eq(walletLinks.userId, userId));
    if (
      !links.some(
        (w) =>
          w.network === "eip155" && w.address.toLowerCase() === input.wallet,
      )
    )
      throw new RelayError(
        "RELAY_SOURCE_UNVERIFIED",
        "Verify your EVM wallet before requesting a quote.",
        403,
      );
    const route = relayRoutes[input.routeId];
    if (
      route.destinationNetwork === "solana" &&
      !links.some(
        (w) =>
          ["devnet", "mainnet"].includes(w.network) &&
          w.address === input.recipient,
      )
    )
      throw new RelayError(
        "RELAY_DESTINATION_UNVERIFIED",
        "Verify your Solana wallet before requesting a quote.",
        403,
      );
    if (
      route.destinationNetwork === "eip155" &&
      input.recipient.toLowerCase() !== input.wallet
    )
      throw new RelayError(
        "RELAY_DESTINATION_UNVERIFIED",
        "Use the same verified wallet for this testnet route.",
        403,
      );
    const [prior] = await tx
      .select()
      .from(relayRequests)
      .where(eq(relayRequests.idempotencyKey, key))
      .limit(1);
    if (prior) {
      if (
        (prior.data as Data).kind !== "relay-preview" ||
        relayInputKey((prior.data as Data).input) !== fingerprint
      )
        throw new RelayError(
          "RELAY_IDEMPOTENCY_CONFLICT",
          "This request key was already used for another route or amount.",
          409,
        );
      if (prior.state === "quoting") {
        if (Date.now() - prior.createdAt.getTime() < 45000)
          throw new RelayError(
            "RELAY_QUOTING",
            "Quote is already being requested. Wait a moment.",
            409,
          );
        const [timedOut] = await tx
          .update(relayRequests)
          .set({
            state: "failed",
            data: {
              ...(prior.data as Data),
              error:
                "The previous quote request timed out. Request a new quote.",
            },
          })
          .where(eq(relayRequests.id, prior.id))
          .returning();
        return { row: timedOut!, created: false };
      }
      return { row: prior, created: false };
    }
    const recent = await tx
      .select({ id: relayRequests.id })
      .from(relayRequests)
      .where(
        and(
          eq(relayRequests.userId, userId),
          gt(relayRequests.createdAt, new Date(Date.now() - 60000)),
        ),
      )
      .limit(6);
    if (recent.length >= 5)
      throw new RelayError(
        "RELAY_QUOTE_LIMIT",
        "Wait a minute before requesting more quotes.",
        429,
      );
    const [row] = await tx
      .insert(relayRequests)
      .values({
        userId,
        idempotencyKey: key,
        state: "quoting",
        data: { kind: "relay-preview", input } satisfies Data,
      })
      .returning();
    await tx.insert(auditEvents).values({
      userId,
      action: "relay.quote.requested",
      data: {
        id: row!.id,
        routeId: input.routeId,
        environment: route.environment,
      },
    });
    return { row: row!, created: true };
  });
  if (!claim.created) return relayRecordView(claim.row);
  try {
    const quote = await quoteProvider(input);
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(relayRequests)
        .set({
          providerId: quote.requestId,
          state: "quoted",
          data: { kind: "relay-preview", input, quote } satisfies Data,
        })
        .where(
          and(
            eq(relayRequests.id, claim.row.id),
            eq(relayRequests.state, "quoting"),
          ),
        )
        .returning();
      if (!row)
        throw new RelayError(
          "RELAY_QUOTE_EXPIRED",
          "Quote request expired. Request a new quote.",
          409,
        );
      await tx.insert(auditEvents).values({
        userId,
        action: "relay.quote.saved",
        data: { id: row.id, providerId: quote.requestId, canExecute: false },
      });
      return relayRecordView(row);
    });
  } catch (error) {
    const message =
      error instanceof RelayError
        ? error.message
        : "Quote could not be saved. Request a new quote.";
    const [row] = await db
      .update(relayRequests)
      .set({
        state: "failed",
        data: { kind: "relay-preview", input, error: message } satisfies Data,
      })
      .where(
        and(
          eq(relayRequests.id, claim.row.id),
          eq(relayRequests.state, "quoting"),
        ),
      )
      .returning();
    await db.insert(auditEvents).values({
      userId,
      action: "relay.quote.failed",
      data: {
        id: claim.row.id,
        code: error instanceof RelayError ? error.code : "QUOTE_SAVE_FAILED",
      },
    });
    return relayRecordView(
      row ?? (await ownedRelayRecord(userId, claim.row.id)),
    );
  }
}
export async function refreshRelayStatus(
  userId: string,
  id: string,
  provider = relayStatus,
) {
  const row = await ownedRelayRecord(userId, id),
    d = row.data as Data;
  if (!d.quote) return relayRecordView(row);
  if (d.status && Date.now() - Date.parse(d.status.checkedAt) < 10000)
    return relayRecordView(row);
  const status = await provider(d.quote);
  // Provider success is only a report, never destination confirmation or spendable funds.
  const [saved] = await getDb()
    .update(relayRequests)
    .set({ data: { ...d, status } })
    .where(and(eq(relayRequests.id, id), eq(relayRequests.userId, userId)))
    .returning();
  await getDb()
    .insert(auditEvents)
    .values({
      userId,
      action: "relay.status.observed",
      data: {
        id,
        providerState: status.providerState,
        independentlyConfirmed: false,
      },
    });
  return relayRecordView(saved!);
}
