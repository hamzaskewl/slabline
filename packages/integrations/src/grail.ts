import { z } from "zod";
import {
  grailSubjects,
  type GrailToken,
  type GrailRewardDetails,
} from "@collectible/domain";
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

const reserve = z.object({
  reserve_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  name: z.string().max(500),
  image_url: z.string().nullable(),
  multiplier: z.number().positive().finite(),
  vaulted_cards_count: z.number().int().nonnegative(),
  available_nfts_count: z.number().int().nonnegative(),
});
const details = z.object({
  chain_id: z.number().int(),
  token_address: z.string(),
  symbol: z.string(),
  market_price: z.number().nonnegative().finite().nullable(),
  unpriced: z.boolean(),
  ohlcv_list: z.array(
    z.tuple([
      z.number().int().nonnegative(),
      z.number(),
      z.number(),
      z.number(),
      z.number().nonnegative(),
      z.number().nonnegative(),
    ]),
  ),
  reserves: z.array(reserve),
});

export function normalizeGrailRewardDetails(
  raw: unknown,
  token: GrailToken,
): GrailRewardDetails {
  const d = details.parse(raw);
  if (
    d.chain_id !== token.chainId ||
    d.token_address.toLowerCase() !== token.address.toLowerCase() ||
    d.symbol.toLowerCase() !== token.symbol.toLowerCase()
  )
    throw new Error("Grail token identity mismatch");
  // Some Grail responses contain zero-price placeholder candles. Omit those,
  // rather than drawing a false crash to zero or discarding valid vault data.
  const history = [
    ...new Map(
      d.ohlcv_list
        .filter((c) => c[4] > 0 && c[0] <= Date.now() / 1000)
        .map((c) => [c[0], { time: c[0], price: c[4], volume: c[5] }]),
    ).values(),
  ]
    .sort((a, b) => a.time - b.time)
    .slice(-2000);
  return {
    tokenId: token.id,
    priceUsd:
      !d.unpriced && d.market_price && d.market_price >= 1e-12
        ? d.market_price.toFixed(12)
        : null,
    observedAt: new Date().toISOString(),
    lastTradeAt: history.length
      ? new Date(history.at(-1)!.time * 1000).toISOString()
      : null,
    history,
    reserves: d.reserves.map((r) => ({
      id: r.reserve_address.toLowerCase(),
      name: r.name.trim(),
      image: safeImage(r.image_url),
      tokensPerItem: String(r.multiplier),
      vaulted: r.vaulted_cards_count,
      available: r.available_nfts_count,
    })),
  };
}

export async function getGrailRewardDetails(
  chainId: number,
  address: string,
): Promise<GrailRewardDetails> {
  const token = (await listGrailTokens()).find(
    (t) =>
      t.chainId === chainId &&
      t.address.toLowerCase() === address.toLowerCase(),
  );
  if (!token) throw new Error("Unknown Grail token");
  return cached(`grail:reward:v1:${token.id}`, 60000, async () => {
    const response = await fetch(
      `https://grail.xyz/api/tokens/${encodeURIComponent(token.symbol)}/`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!response.ok) throw new Error(`Grail HTTP ${response.status}`);
    return normalizeGrailRewardDetails(await response.json(), token);
  });
}
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
