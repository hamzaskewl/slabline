import { NextResponse } from "next/server";
import { getDb, oauthStates } from "@collectible/db";
import { geminiOAuth } from "@collectible/integrations";
import { encryptSecret } from "@collectible/integrations";
import { apiRoute, authenticate, requireOrigin, ApiError } from "@/server/auth";
export async function POST(request: Request) {
  return apiRoute(async () => {
    requireOrigin(request);
    const user = await authenticate(request);
    if (!process.env.TOKEN_ENCRYPTION_KEY)
      throw new ApiError(503, "OAuth token encryption key is not configured");
    let authorization;
    try {
      authorization = await geminiOAuth().beginAuthorization([
        "balances:read",
        "orders:read",
      ]);
    } catch (e) {
      throw new ApiError(
        503,
        e instanceof Error ? e.message : "Gemini OAuth unavailable",
      );
    }
    await getDb()
      .insert(oauthStates)
      .values({
        state: authorization.transaction.state,
        userId: user.id,
        encryptedTransaction: encryptSecret(
          JSON.stringify(authorization.transaction),
          process.env.TOKEN_ENCRYPTION_KEY,
        ),
        expiresAt: new Date(Date.now() + 600000),
      });
    const response = NextResponse.json({ url: authorization.url });
    response.cookies.set("cm-gemini-state", authorization.transaction.state, {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      maxAge: 600,
      path: "/api/gemini",
    });
    return response;
  });
}
