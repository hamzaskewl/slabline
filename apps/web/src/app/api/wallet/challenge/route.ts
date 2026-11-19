import { randomBytes } from "node:crypto";
import { z } from "zod";
import { address } from "@solana/kit";
import { getDb, walletChallenges } from "@collectible/db";
import { solanaNetwork } from "@collectible/integrations";
import {
  apiRoute,
  authenticate,
  requireOrigin,
  boundedJson,
  ApiError,
} from "@/server/auth";
export async function POST(request: Request) {
  return apiRoute(async () => {
    requireOrigin(request);
    const user = await authenticate(request);
    const parsed = z
      .object({ address: z.string().min(32).max(44) })
      .safeParse(await boundedJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid Solana address");
    try {
      address(parsed.data.address);
    } catch {
      throw new ApiError(400, "Invalid Solana address");
    }
    const nonce = randomBytes(24).toString("hex"),
      expiresAt = new Date(Date.now() + 300000);
    const message = `Collectible Markets wallet verification\nOrigin: ${new URL(process.env.APP_URL ?? "http://localhost:3000").origin}\nUser: ${user.id}\nWallet: ${parsed.data.address}\nNetwork: ${solanaNetwork()}\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}\nThis signature links a wallet. It does not authorize any transaction.`;
    await getDb().insert(walletChallenges).values({
      nonce,
      userId: user.id,
      address: parsed.data.address,
      message,
      expiresAt,
    });
    return Response.json({
      nonce,
      message,
      expiresAt: expiresAt.toISOString(),
    });
  }, request);
}
