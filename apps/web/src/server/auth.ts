import { PrivyClient } from "@privy-io/node";
import { getDb, users, eq } from "@collectible/db";
import { withSolanaNetwork } from "@collectible/integrations";
let privy: PrivyClient | undefined;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireOrigin(request: Request) {
  const expected = new URL(process.env.APP_URL ?? "http://localhost:3000")
    .origin;
  if (request.headers.get("origin") !== expected)
    throw new ApiError(403, "Request origin is not allowed");
}
export async function authenticate(request: Request) {
  if (!process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET)
    throw new ApiError(
      503,
      "Privy app credentials are not configured in server secrets",
    );
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new ApiError(401, "Sign in to continue");
  privy ??= new PrivyClient({
    appId: process.env.PRIVY_APP_ID,
    appSecret: process.env.PRIVY_APP_SECRET,
  });
  let userId: string;
  try {
    userId = (await privy.utils().auth().verifyAccessToken(token)).user_id;
  } catch {
    throw new ApiError(401, "Invalid or expired app session");
  }
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ privyId: userId })
    .onConflictDoUpdate({ target: users.privyId, set: { privyId: userId } })
    .returning();
  if (!user) throw new ApiError(503, "Cannot establish user record");
  return user;
}
export async function apiRoute(
  action: () => Promise<Response>,
  request?: Request,
) {
  try {
    const network = request?.headers.get("x-market-network");
    if (network === "mainnet" || network === "devnet")
      return await withSolanaNetwork(network, action);
    return await action();
  } catch (e) {
    if (e instanceof ApiError)
      return Response.json({ error: e.message }, { status: e.status });
    return Response.json(
      {
        error:
          "Request could not be completed. Check server configuration and retry.",
      },
      { status: 503 },
    );
  }
}
export async function boundedJson(request: Request) {
  const body = await request.text();
  if (body.length > 16000) throw new ApiError(413, "Request too large");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ApiError(400, "Invalid JSON");
  }
}
