import {
  OAuthAuth,
  createClient,
  type OAuthTokens,
} from "@gemini-markets/sdk/server";
import { getDb, linkedGeminiAccounts, eq, sql, and } from "@collectible/db";
import { encryptSecret, decryptSecret } from "./security";
import { IntegrationBlocked } from "@collectible/domain";
import { AsyncLocalStorage } from "node:async_hooks";
type TokenDatabase = Pick<
  ReturnType<typeof getDb>,
  "select" | "insert" | "delete"
>;
const tokenTransaction = new AsyncLocalStorage<TokenDatabase>();

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
export async function getGeminiAccountSnapshot(userId: string) {
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
      })),
      settlements: (settlements.positions ?? []).map((p) => ({
        symbol: p.instrumentSymbol ?? "Unknown",
        payout: p.payout ?? null,
        settledAt: p.settledAt ?? null,
      })),
      activeOrders: JSON.parse(
        JSON.stringify(activeOrders, (_key, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      ) as unknown,
      observedAt: new Date().toISOString(),
    };
  } finally {
    client.close();
  }
}
