import {
  OAuthAuth,
  createClient,
  type OAuthTokens,
} from "@gemini-markets/sdk/server";
import { getDb, linkedGeminiAccounts, eq, sql, and } from "@collectible/db";
import { encryptSecret, decryptSecret } from "./security";
import {
  IntegrationBlocked,
  type GeminiConnection,
  type GeminiSnapshot,
} from "@collectible/domain";
import { AsyncLocalStorage } from "node:async_hooks";
type TokenDatabase = Pick<
  ReturnType<typeof getDb>,
  "select" | "insert" | "delete"
>;
const tokenTransaction = new AsyncLocalStorage<TokenDatabase>();

export function geminiReadiness(
  linked: boolean,
  rawScopes: unknown,
): GeminiConnection {
  const environment =
    process.env.GEMINI_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
  const scopes = Array.isArray(rawScopes)
    ? rawScopes.filter((s): s is string => typeof s === "string")
    : [];
  const configured = !!(
    process.env.GEMINI_OAUTH_CLIENT_ID &&
    process.env.GEMINI_OAUTH_CLIENT_SECRET &&
    process.env.TOKEN_ENCRYPTION_KEY
  );
  const approved =
    environment === "sandbox" ||
    process.env.GEMINI_OAUTH_PRODUCTION_APPROVED === "true";
  const canConnect = configured && approved;
  const missingScope =
    linked &&
    !["balances:read", "orders:read"].every((s) => scopes.includes(s));
  return {
    environment,
    linked,
    scopes,
    canConnect,
    canRead: canConnect && linked && !missingScope,
    blocker: !configured
      ? "Gemini connection is not configured."
      : !approved
        ? "Gemini app approval is pending."
        : missingScope
          ? "Reconnect Gemini to grant balances and orders read access."
          : !linked
            ? "Connect your Gemini account to see balances and positions."
            : null,
  };
}
export async function getGeminiConnection(userId: string) {
  const [row] = await getDb()
    .select({ scopes: linkedGeminiAccounts.scopes })
    .from(linkedGeminiAccounts)
    .where(eq(linkedGeminiAccounts.userId, userId))
    .limit(1);
  return geminiReadiness(!!row, row?.scopes);
}

function encryptionKey() {
  if (!process.env.TOKEN_ENCRYPTION_KEY)
    throw new IntegrationBlocked(
      "Gemini",
      "TOKEN_ENCRYPTION_KEY is not configured",
    );
  return process.env.TOKEN_ENCRYPTION_KEY;
}
export function geminiOAuth(userId?: string) {
  const clientId = process.env.GEMINI_OAUTH_CLIENT_ID,
    clientSecret = process.env.GEMINI_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new IntegrationBlocked(
      "Gemini",
      "OAuth client credentials are not configured",
    );
  const env =
    process.env.GEMINI_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
  if (
    env === "production" &&
    process.env.GEMINI_OAUTH_PRODUCTION_APPROVED !== "true"
  )
    throw new IntegrationBlocked(
      "Gemini",
      "Production OAuth app review has not been verified",
    );
  const db = getDb();
  const tokenDb = () => tokenTransaction.getStore() ?? db;
  async function load() {
    if (!userId) return undefined;
    const [row] = await tokenDb()
      .select()
      .from(linkedGeminiAccounts)
      .where(eq(linkedGeminiAccounts.userId, userId))
      .limit(1);
    return row
      ? (JSON.parse(
          decryptSecret(row.encryptedRefreshToken, encryptionKey()),
        ) as OAuthTokens)
      : undefined;
  }
  return new OAuthAuth({
    env,
    client: {
      type: "confidential",
      clientId,
      clientSecret,
      redirectUri: `${process.env.APP_URL ?? "http://localhost:3000"}/api/gemini/callback`,
    },
    ...(userId
      ? {
          tokenStore: {
            load,
            async save(tokens: OAuthTokens) {
              const sealed = encryptSecret(
                JSON.stringify(tokens),
                encryptionKey(),
              );
              await tokenDb()
                .insert(linkedGeminiAccounts)
                .values({
                  userId,
                  encryptedRefreshToken: sealed,
                  scopes: tokens.scope.split(","),
                })
                .onConflictDoUpdate({
                  target: linkedGeminiAccounts.userId,
                  set: {
                    encryptedRefreshToken: sealed,
                    scopes: tokens.scope.split(","),
                  },
                });
            },
            async clear() {
              await tokenDb()
                .delete(linkedGeminiAccounts)
                .where(eq(linkedGeminiAccounts.userId, userId));
            },
            async clearIfCurrent(refreshToken: string) {
              const [row] = await tokenDb()
                .select()
                .from(linkedGeminiAccounts)
                .where(eq(linkedGeminiAccounts.userId, userId))
                .limit(1);
              if (!row) return false;
              const current = JSON.parse(
                decryptSecret(row.encryptedRefreshToken, encryptionKey()),
              ) as OAuthTokens;
              if (current.refreshToken !== refreshToken) return false;
              const deleted = await tokenDb()
                .delete(linkedGeminiAccounts)
                .where(
                  and(
                    eq(linkedGeminiAccounts.userId, userId),
                    eq(
                      linkedGeminiAccounts.encryptedRefreshToken,
                      row.encryptedRefreshToken,
                    ),
                  ),
                )
                .returning();
              return deleted.length > 0;
            },
            async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
              return db.transaction(async (tx) => {
                await tx.execute(
                  sql`select pg_advisory_xact_lock(hashtext(${userId}))`,
                );
                return tokenTransaction.run(tx, operation);
              });
            },
          },
        }
      : {}),
  });
}
export async function getGeminiAccountSnapshot(
  userId: string,
): Promise<GeminiSnapshot> {
  const connection = await getGeminiConnection(userId);
  if (!connection.canRead)
    throw new IntegrationBlocked(
      "Gemini",
      connection.blocker ?? "Account is unavailable",
    );
  const auth = geminiOAuth(userId);
  const client = await createClient({
    env:
      process.env.GEMINI_ENVIRONMENT === "sandbox" ? "sandbox" : "production",
    auth,
    skipWsInit: true,
    timeoutMs: 12000,
  });
  try {
    const [balances, positions, settlements, activeOrders] = await Promise.all([
      client.account.getAvailableBalances({ account: "primary" }),
      client.predictions.getPositions(),
      client.predictions.getSettledPositions(),
      client.predictions.getActiveOrders(),
    ]);
    return {
      balances: balances.map((b) => ({
        currency: b.currency ?? "Unknown",
        available: b.available === undefined ? null : String(b.available),
        availableForWithdrawal:
          b.availableForWithdrawal === undefined
            ? null
            : String(b.availableForWithdrawal),
      })),
      positions: (positions.positions ?? []).map((p) => ({
        symbol: p.symbol ?? "Unknown",
        quantity: p.totalQuantity ?? null,
        outcome: p.outcome ?? null,
        marketValue: p.marketValue ?? null,
        averageEntryPrice: p.avgPrice ?? null,
        // Gemini's published binary contract terms pay $1 for a correct outcome.
        // Require the provider's instrument type; never derive this from a price.
        payoutPerShare: p.contractMetadata?.eventType === "binary" ? "1" : null,
        resolutionSide: p.resolutionSide ?? null,
        context: {
          title: p.contractMetadata?.eventName ?? null,
          label: p.contractMetadata?.contractName ?? null,
          eventTicker: p.contractMetadata?.eventTicker ?? null,
          contractStatus: p.contractMetadata?.contractStatus ?? null,
          eventType: p.contractMetadata?.eventType ?? null,
        },
      })),
      settlements: (settlements.positions ?? []).map((p) => ({
        symbol: p.instrumentSymbol ?? "Unknown",
        payout: p.payout ?? null,
        settledAt: p.settledAt ?? null,
        outcome: p.outcome ?? null,
        resolutionSide: p.resolutionSide ?? null,
        quantity: p.positionQuantity ?? null,
        costBasis: p.costBasis ?? null,
        realizedPnl: p.realizedPnl ?? null,
        context: {
          title: p.contractMetadata?.eventName ?? null,
          label: p.contractMetadata?.contractName ?? null,
          eventTicker: p.contractMetadata?.eventTicker ?? null,
          contractStatus: p.contractMetadata?.contractStatus ?? null,
          eventType: p.contractMetadata?.eventType ?? null,
        },
      })),
      activeOrders: (activeOrders.orders ?? []).map((o) => ({
        id: o.orderId == null ? null : String(o.orderId),
        symbol: o.symbol ?? "Unknown",
        side: o.side ?? null,
        outcome: o.outcome ?? null,
        price: o.price ?? null,
        remainingQuantity: o.remainingQuantity ?? null,
        status: o.status ?? null,
      })),
      observedAt: new Date().toISOString(),
    };
  } finally {
    client.close();
  }
}
