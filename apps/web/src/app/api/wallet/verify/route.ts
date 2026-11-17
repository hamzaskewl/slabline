import { z } from "zod";
import {
  getDb,
  walletChallenges,
  walletLinks,
  auditEvents,
  eq,
  and,
  gt,
  isNull,
} from "@collectible/db";
import { verifyWalletProof, solanaNetwork } from "@collectible/integrations";
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
    const input = z
      .object({ nonce: z.string().length(48), signature: z.string().max(128) })
      .safeParse(await boundedJson(request));
    if (!input.success) throw new ApiError(400, "Invalid proof");
    const db = getDb();
    const conditions = and(
      eq(walletChallenges.nonce, input.data.nonce),
      eq(walletChallenges.userId, user.id),
      isNull(walletChallenges.usedAt),
      gt(walletChallenges.expiresAt, new Date()),
    );
    const [challenge] = await db
      .select()
      .from(walletChallenges)
      .where(conditions)
      .limit(1);
    if (
      !challenge ||
      !challenge.message.includes(`\nNetwork: ${solanaNetwork()}\n`) ||
      !verifyWalletProof(
        challenge.address,
        challenge.message,
        input.data.signature,
      )
    )
      throw new ApiError(403, "Expired, replayed or invalid wallet signature");
    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(walletChallenges)
        .set({ usedAt: new Date() })
        .where(conditions)
        .returning();
      if (!claimed.length) throw new ApiError(409, "Wallet proof already used");
      const [existing] = await tx
        .select()
        .from(walletLinks)
        .where(eq(walletLinks.address, challenge.address))
        .limit(1);
      if (existing && existing.userId !== user.id)
        throw new ApiError(409, "Wallet is linked to another app account");
      const linked = await tx
        .insert(walletLinks)
        .values({
          userId: user.id,
          address: challenge.address,
          network: solanaNetwork(),
          verifiedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: walletLinks.address,
          set: { network: solanaNetwork(), verifiedAt: new Date() },
          where: eq(walletLinks.userId, user.id),
        })
        .returning({ address: walletLinks.address });
      if (!linked.length)
        throw new ApiError(409, "Wallet is linked to another app account");
      await tx.insert(auditEvents).values({
        userId: user.id,
        action: "wallet.link.verified",
        data: { address: challenge.address },
      });
    });
    return Response.json({ verified: true, address: challenge.address });
  });
}
