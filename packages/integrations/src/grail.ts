import { z } from "zod";
import { grailSubjects, type GrailToken } from "@collectible/domain";
import { getDb, assets, sql } from "@collectible/db";
import { cached } from "./catalog";
import { safeImage } from "./gemini";

const token = z.object({
  chain_id: z.number().int().positive(),
  token_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  symbol: z.string().min(1).max(50),
  name: z.string(),
  image_url: z.string().nullable(),
  tags: z.array(z.string()),
  deployment_status: z.string(),
});
const page = z.object({ results: z.array(token), next: z.string().nullable() });
// Public read endpoint used by https://grail.xyz. Observed API, not a partner
// contract: fail closed on schema changes. Never infer a swap or redemption quote.
export async function listGrailTokens(): Promise<GrailToken[]> {
  return cached("grail:tokens:v1", 300000, async () => {
    const rows: GrailToken[] = [];
    let url: string | null = "https://grail.xyz/api/tokens/?limit=100";
    const seen = new Set<string>();
    while (url) {
      const nextUrl = new URL(url, "https://grail.xyz");
      if (
        nextUrl.origin !== "https://grail.xyz" ||
        nextUrl.pathname !== "/api/tokens/" ||
        seen.has(nextUrl.href) ||
        seen.size >= 20
      )
        throw new Error("Unsupported Grail pagination");
      seen.add(nextUrl.href);
      const response = await fetch(nextUrl, {
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`Grail HTTP ${response.status}`);
      const data = page.parse(await response.json());
      rows.push(
        ...data.results
          .filter((t) => t.deployment_status === "DEPLOYED")
          .map((t) => ({
            id: `eip155:${t.chain_id}:${t.token_address.toLowerCase()}`,
            symbol: t.symbol,
            name: grailSubjects[t.symbol.toLowerCase()]?.name ?? t.name,
            address: t.token_address,
            chainId: t.chain_id,
            chain:
              t.chain_id === 8453
                ? "Base"
                : t.chain_id === 4663
                  ? "Robinhood"
                  : `Chain ${t.chain_id}`,
            image: safeImage(t.image_url),
            tags: t.tags,
            url: `https://grail.xyz/trade/${encodeURIComponent(t.symbol.toLowerCase())}`,
            observedAt: new Date().toISOString(),
          })),
      );
      url = data.next;
    }
    if (process.env.DATABASE_URL && rows.length) {
      await getDb()
        .insert(assets)
        .values(
          rows.map((t) => ({
            mint: t.id,
            network: `eip155:${t.chainId}`,
            provider: "grail",
            data: t,
          })),
        )
        .onConflictDoUpdate({
          target: assets.mint,
          set: { data: sql`excluded.data`, network: sql`excluded.network` },
        });
    }
    return rows;
  });
}
