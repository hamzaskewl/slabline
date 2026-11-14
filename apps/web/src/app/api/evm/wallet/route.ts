import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  getDb,
  walletChallenges,
  walletLinks,
  auditEvents,
  and,
  eq,
  gt,
  isNull,
} from "@collectible/db";
import { evmAddress, evmChainId } from "@collectible/domain";
import { verifyEvmMessage } from "@collectible/integrations";
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
    const user = await authenticate(request),
      db = getDb();
    const input = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("challenge"),
          address: evmAddress,
          chainId: evmChainId,
        }),
        z.object({
          action: z.literal("verify"),
          nonce: z.string().length(48),
          signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
          chainId: evmChainId,
        }),
      ])
      .parse(await boundedJson(request));
    if (input.action === "challenge") {
      const recent = await db
        .select({ nonce: walletChallenges.nonce })
        .from(walletChallenges)
        .where(
          and(
            eq(walletChallenges.userId, user.id),
            gt(walletChallenges.expiresAt, new Date()),
          ),
        )
        .limit(20);
      if (recent.length >= 20)
        throw new ApiError(429, "Wait a few minutes before verifying again.");
      const nonce = randomBytes(24).toString("hex"),
        expiresAt = new Date(Date.now() + 300000);
      const message = `Collectible Markets EVM wallet verification\nOrigin: ${new URL(process.env.APP_URL ?? "http://localhost:3000").origin}\nUser: ${user.id}\nWallet: ${input.address}\nChain: eip155:${input.chainId}\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}\nThis links your wallet. It does not authorize token spending.`;
      await db.insert(walletChallenges).values({
        nonce,
        userId: user.id,
        address: input.address,
        message,
        expiresAt,
      });
      return Response.json({ nonce, message });
    }
    const conditions = and(
      eq(walletChallenges.nonce, input.nonce),
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
      !challenge.message.startsWith(
        "Collectible Markets EVM wallet verification\n",
      ) ||
      !challenge.message.includes(`\nChain: eip155:${input.chainId}\n`) ||
      !(await verifyEvmMessage(
        input.chainId,
        evmAddress.parse(challenge.address),
        challenge.message,
        input.signature as `0x${string}`,
      ))
    )
      throw new ApiError(403, "Expired, replayed or invalid wallet proof.");
    await db.transaction(async (tx) => {
      if (
        !(
          await tx
            .update(walletChallenges)
            .set({ usedAt: new Date() })
            .where(conditions)
            .returning()
        ).length
      )
        throw new ApiError(409, "Wallet proof already used.");
      await tx
        .insert(walletLinks)
        .values({
          userId: user.id,
          address: challenge.address,
          network: "eip155",
          verifiedAt: new Date(),
        })
        .onConflictDoNothing();
      const [link] = await tx
        .select()
        .from(walletLinks)
        .where(eq(walletLinks.address, challenge.address))
        .limit(1);
      if (link?.userId !== user.id || link.network !== "eip155")
        throw new ApiError(409, "Wallet is linked to another account.");
      await tx.insert(auditEvents).values({
        userId: user.id,
        action: "evm.wallet.verified",
        data: { address: challenge.address, chainId: input.chainId },
      });
    });
    return Response.json({ verified: true, address: challenge.address });
  });
}
