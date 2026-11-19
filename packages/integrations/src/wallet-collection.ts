import { address } from "@solana/kit";
import { z } from "zod";
import { getDb, walletLinks, eq, and } from "@collectible/db";
import { IntegrationBlocked, type WalletCollection } from "@collectible/domain";
import { cached } from "./catalog";
import { safeImage } from "./gemini";
import { solanaNetwork, solanaRpc, SOLANA_GENESIS } from "./solana";
import { quickNodeFetch } from "./quicknode-budget";
import { attachWalletValuations } from "./valuations";

const limit = 24;
const item = z.object({
  id: z.string(),
  interface: z.string(),
  burnt: z.boolean().optional(),
  ownership: z.object({ owner: z.string() }),
  content: z
    .object({
      metadata: z.object({ name: z.string().optional() }).optional(),
      links: z.object({ image: z.string().optional() }).optional(),
      files: z
        .array(
          z.object({ uri: z.string().optional(), mime: z.string().optional() }),
        )
        .optional(),
    })
    .nullish(),
});
const nonfungible = new Set([
  "V1_NFT",
  "V1_PRINT",
  "LEGACY_NFT",
  "V2_NFT",
  "ProgrammableNFT",
  "MplCoreAsset",
]);
export function normalizeWalletCollection(
  raw: unknown,
  wallet: string,
  network: "devnet" | "mainnet",
  page: number,
): WalletCollection {
  const parsed = z
    .object({
      result: z.object({
        items: z.array(item).max(limit),
        page: z.number().optional(),
      }),
      error: z.unknown().optional(),
    })
    .parse(raw);
  if (
    parsed.error ||
    (parsed.result.page !== undefined && parsed.result.page !== page)
  )
    throw new Error("DAS collection response mismatch");
  const seen = new Set<string>();
  const assets = parsed.result.items
    .filter((a) => {
      address(a.id);
      if (
        a.burnt ||
        a.ownership.owner !== wallet ||
        !nonfungible.has(a.interface) ||
        seen.has(a.id)
      )
        return false;
      seen.add(a.id);
      return true;
    })
    .map((a) => ({
      mint: a.id,
      name: a.content?.metadata?.name?.slice(0, 180) || "Untitled collectible",
      imageUrl:
        safeImage(a.content?.links?.image) ??
        safeImage(
          a.content?.files?.find((f) => f.mime?.startsWith("image/"))?.uri,
        ),
      interface: a.interface,
    }));
  return {
    wallet,
    network,
    assets,
    page,
    hasMore: parsed.result.items.length === limit && page < 100,
    observedAt: new Date().toISOString(),
    source: "das",
  };
}
export async function requireSolanaWallet(userId: string, wallet: string) {
  address(wallet);
  const [link] = await getDb()
    .select({ address: walletLinks.address })
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.userId, userId),
        eq(walletLinks.address, wallet),
        eq(walletLinks.network, solanaNetwork()),
      ),
    )
    .limit(1);
  if (!link)
    throw new IntegrationBlocked(
      "Wallet",
      "Verify this Solana wallet for the active network first.",
    );
}
export async function getWalletCollection(
  userId: string,
  wallet: string,
  page = 1,
) {
  if (!Number.isInteger(page) || page < 1 || page > 100)
    throw new Error("Invalid collection page");
  // Authorize before even consulting the shared cache. Cache identity includes network.
  await requireSolanaWallet(userId, wallet);
  const endpoint = process.env.QUICKNODE_DAS_RPC_URL;
  if (!endpoint)
    throw new IntegrationBlocked(
      "Collection",
      "Wallet collectible indexing is not configured.",
    );
  const network = solanaNetwork();
  return cached(
    `wallet-collection:v1:${network}:${wallet}:${page}`,
    60000,
    async () => {
      const hash = await solanaRpc(network, endpoint, false)
        .getGenesisHash()
        .send({ abortSignal: AbortSignal.timeout(15000) });
      if (hash !== SOLANA_GENESIS[network])
        throw new Error("DAS network mismatch");
      const response = await quickNodeFetch()(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAssetsByOwner",
          params: {
            ownerAddress: wallet,
            page,
            limit,
            options: { showFungible: false },
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error("Wallet collectible index is unavailable");
      const collection = normalizeWalletCollection(
        await response.json(),
        wallet,
        network,
        page,
      );
      return {
        ...collection,
        assets: await attachWalletValuations(collection.assets, network),
      };
    },
  );
}
