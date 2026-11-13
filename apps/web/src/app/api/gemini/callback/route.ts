import { NextRequest, NextResponse } from "next/server";
import {
  getDb,
  oauthStates,
  linkedGeminiAccounts,
  auditEvents,
  eq,
  and,
  gt,
  isNull,
} from "@collectible/db";
import {
  geminiOAuth,
  encryptSecret,
  decryptSecret,
} from "@collectible/integrations";
import { apiRoute, ApiError } from "@/server/auth";
export async function GET(request: NextRequest) {
  return apiRoute(async () => {
    const state = request.nextUrl.searchParams.get("state");
    if (!state || state !== request.cookies.get("cm-gemini-state")?.value)
      throw new ApiError(403, "OAuth state mismatch");
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) throw new ApiError(503, "Token encryption is not configured");
    const db = getDb();
    const [record] = await db
      .update(oauthStates)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(oauthStates.state, state),
          isNull(oauthStates.consumedAt),
          gt(oauthStates.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!record)
      throw new ApiError(403, "OAuth callback expired or already used");
    const transaction = JSON.parse(
      decryptSecret(record.encryptedTransaction, key),
    );
    const tokens = await geminiOAuth().completeAuthorization(
      request.url,
      transaction,
    );
    const encrypted = encryptSecret(JSON.stringify(tokens), key);
    await db.transaction(async (tx) => {
      await tx
        .insert(linkedGeminiAccounts)
        .values({
          userId: record.userId,
          encryptedRefreshToken: encrypted,
          scopes: tokens.scope.split(","),
        })
        .onConflictDoUpdate({
          target: linkedGeminiAccounts.userId,
          set: {
            encryptedRefreshToken: encrypted,
            scopes: tokens.scope.split(","),
          },
        });
      await tx.insert(auditEvents).values({
        userId: record.userId,
        action: "gemini.oauth.linked",
        data: { scopes: tokens.scope },
      });
    });
    const response = NextResponse.redirect(
      new URL("/portfolio", process.env.APP_URL ?? "http://localhost:3000"),
    );
    response.cookies.delete("cm-gemini-state");
    return response;
  });
}
