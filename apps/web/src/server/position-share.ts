import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { PrivyClient } from "@privy-io/node";
import {
  getDb,
  eq,
  and,
  lt,
  gt,
  sql,
  contracts,
  markets,
  positions,
  walletLinks,
  positionShareTargets,
  positionShareDrafts,
  publicPositionShares,
} from "@collectible/db";
import {
  demoAccount,
  getGeminiAccountSnapshot,
  listRewardCards,
  listGrailTokens,
  getGrailRewardDetails,
  withSolanaNetwork,
} from "@collectible/integrations";
import {
  demoShareSnapshot,
  geminiShareFinancials,
  shareIdentity,
  demoPositionContext,
  positionRewardMarket,
  marketOutcomes,
  matchingTokens,
  slabFromListing,
  DEMO_REPLAY_CARD,
  type ShareReference,
  type ShareSnapshot,
  type ShareSlab,
  type Market,
} from "@collectible/domain";
import { ApiError } from "./auth";
import { renderShare } from "./share-renderer";
import { safeShareImage, shareImage } from "./share-image";

export const shareReferenceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("demo"), id: z.string().uuid() }).strict(),
  z
    .object({
      source: z.literal("gemini"),
      symbol: z.string().regex(/^GEMI-[A-Z0-9-]{1,115}$/),
      outcome: z.string().max(100).nullable(),
      settledAt: z.string().max(80).nullable(),
      kind: z.enum(["position", "settlement"]),
    })
    .strict(),
]);
export const targetChoiceSchema = z
  .object({
    source: z.enum(["collectorcrypt", "grail"]),
    sourceId: z.string().max(160),
    reserveId: z.string().max(100).optional(),
  })
  .strict();
type Owner = { id: string; privyId: string };
// PostgreSQL jsonb reorders object keys. Hash values canonically across round-trips.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const referenceKey = (userId: string, reference: ShareReference) =>
  createHash("sha256")
    .update(
      `${userId}:${JSON.stringify(canonical(reference.source === "demo" ? reference : { source: reference.source, symbol: reference.symbol, outcome: reference.outcome?.toLowerCase() ?? null }))}`,
    )
    .digest("hex");
export const snapshotFingerprint = (s: ShareSnapshot) =>
  createHash("sha256")
    .update(JSON.stringify(canonical({ ...s, capturedAt: "" })))
    .digest("hex");
async function identity(owner: Owner, visible: boolean) {
  if (!visible) return shareIdentity(false);
  const [wallet] = await getDb()
    .select()
    .from(walletLinks)
    .where(eq(walletLinks.userId, owner.id))
    .limit(1);
  let name: string | null = null;
  try {
    const privy = new PrivyClient({
      appId: process.env.PRIVY_APP_ID!,
      appSecret: process.env.PRIVY_APP_SECRET!,
    });
    const profile = await privy.users()._get(owner.privyId);
    for (const a of profile.linked_accounts) {
      if ("name" in a && typeof a.name === "string" && a.name.trim()) {
        name = a.name;
        break;
      }
      if (
        "username" in a &&
        typeof a.username === "string" &&
        a.username.trim()
      ) {
        name = a.username;
        break;
      }
    }
  } catch {
    /* Verified wallet/Trader remains a truthful fallback. */
  }
  return shareIdentity(true, name, wallet?.address);
}
async function targetFor(owner: Owner, ref: ShareReference) {
  const [row] = await getDb()
    .select()
    .from(positionShareTargets)
    .where(
      and(
        eq(positionShareTargets.key, referenceKey(owner.id, ref)),
        eq(positionShareTargets.userId, owner.id),
      ),
    );
  return row?.data as
    { slab: ShareSlab; market: ShareSnapshot["market"] } | undefined;
}
export async function authoritativeShare(
  owner: Owner,
  ref: ShareReference,
  showProfile: boolean,
  capturedAt = new Date().toISOString(),
  knownIdentity?: ShareSnapshot["identity"],
): Promise<ShareSnapshot> {
  const saved = await targetFor(owner, ref);
  const profile = knownIdentity ?? (await identity(owner, showProfile));
  if (ref.source === "demo") {
    const account = await withSolanaNetwork("devnet", () =>
      demoAccount(owner.id),
    );
    const position = account.positions.find((p) => p.id === ref.id);
    if (!position) throw new ApiError(404, "Position not found.");
    return demoShareSnapshot(
      { ...position, shareTarget: saved?.slab ?? position.shareTarget },
      account.collectibles,
      profile,
      capturedAt,
    );
  }
  const account = await getGeminiAccountSnapshot(owner.id);
  const position =
    ref.kind === "position"
      ? (account.positions.find(
          (p) => p.symbol === ref.symbol && p.outcome === ref.outcome,
        ) ?? null)
      : null;
  const settlement =
    ref.kind === "settlement" || !position
      ? (account.settlements.find(
          (p) =>
            p.symbol === ref.symbol &&
            (ref.kind === "position" || p.settledAt === ref.settledAt) &&
            (p.outcome ?? null) === ref.outcome,
        ) ?? null)
      : null;
  if (!position && !settlement)
    throw new ApiError(
      404,
      "Position not found in your linked Gemini account.",
    );
  const [stored] = await getDb()
    .select({ market: markets.data })
    .from(contracts)
    .innerJoin(markets, eq(contracts.marketId, markets.id))
    .where(eq(contracts.symbol, ref.symbol));
  const market = stored?.market as Market | undefined;
  const contract =
    market && marketOutcomes(market).find((c) => c.symbol === ref.symbol);
  const side = (position?.outcome ?? settlement?.outcome)?.toLowerCase();
  const context = position?.context ?? settlement?.context;
  // Optional provider history fields enrich the share; absent/ambiguous basis stays null.
  // In particular, marketValue is NEVER used as conditional payout or cost basis.
  return {
    version: 1,
    capturedAt,
    environment:
      process.env.GEMINI_ENVIRONMENT === "sandbox" ? "sandbox" : "production",
    ...geminiShareFinancials(position, settlement),
    market: saved?.market ?? {
      eventTicker: context?.eventTicker ?? market?.ticker ?? market?.id ?? "",
      symbol: ref.symbol,
      title: context?.title ?? market?.title ?? ref.symbol,
      selectedOutcome:
        context?.label ??
        contract?.label ??
        ref.outcome ??
        "Outcome unavailable",
      side: side === "yes" || side === "no" ? side : null,
      artwork:
        market && contract ? demoPositionContext(market, contract).artwork : [],
    },
    identity: profile,
    slab: saved?.slab ?? null,
  };
}
export async function shareCatalog(owner: Owner, ref: ShareReference) {
  const snapshot = await authoritativeShare(owner, ref, false);
  let market: Market;
  if (ref.source === "demo") {
    const p = (
      await withSolanaNetwork("devnet", () => demoAccount(owner.id))
    ).positions.find((p) => p.id === ref.id)!;
    market = positionRewardMarket(p);
  } else {
    const [stored] = await getDb()
      .select({ market: markets.data })
      .from(contracts)
      .innerJoin(markets, eq(contracts.marketId, markets.id))
      .where(eq(contracts.symbol, ref.symbol));
    if (!stored)
      return {
        cards: [],
        tokens: [],
        subject: snapshot.market.selectedOutcome,
      };
    market = stored.market as Market;
    const contract = marketOutcomes(market).find(
      (c) => c.symbol === ref.symbol,
    );
    if (contract) market = demoPositionContext(market, contract).rewardMarket;
  }
  const [cards, tokens] = await Promise.all([
    listRewardCards(market),
    listGrailTokens().catch(() => []),
  ]);
  // The replay sample is only offered in the explicit replay, never in real accounts.
  if (
    snapshot.environment === "replay" &&
    !cards.some((c) => c.mint === DEMO_REPLAY_CARD.mint)
  )
    cards.push(DEMO_REPLAY_CARD);
  return {
    cards,
    tokens: matchingTokens(market, tokens),
    subject: snapshot.market.selectedOutcome,
  };
}
export async function saveShareTarget(
  owner: Owner,
  ref: ShareReference,
  choice: z.infer<typeof targetChoiceSchema>,
) {
  const [snapshot, catalog] = await Promise.all([
    authoritativeShare(owner, ref, false),
    shareCatalog(owner, ref),
  ]);
  let slab: ShareSlab;
  if (choice.source === "collectorcrypt") {
    const card = catalog.cards.find((c) => c.mint === choice.sourceId);
    if (!card)
      throw new ApiError(
        409,
        "This card is no longer listed for the selected subject. Refresh the picker.",
      );
    slab = slabFromListing(card);
  } else {
    const token = catalog.tokens.find((t) => t.id === choice.sourceId);
    if (!token)
      throw new ApiError(
        409,
        "This Grail token is not related to the position.",
      );
    const details = await getGrailRewardDetails(token.chainId, token.address);
    const reserve = details.reserves.find(
      (r) => r.id === choice.reserveId && r.available > 0,
    );
    if (!reserve)
      throw new ApiError(409, "The selected Grail reserve is unavailable.");
    slab = {
      source: "grail",
      sourceId: `${token.id}:${reserve.id}`,
      name: reserve.name,
      frontImage: reserve.image,
      player: null,
      year: null,
      set: null,
      grade: null,
      grader: null,
      role: "target",
      observedAt: new Date().toISOString(),
    };
  }
  slab.frontImage =
    (await shareImage(slab.frontImage)) ?? safeShareImage(slab.frontImage);
  const key = referenceKey(owner.id, ref);
  await getDb()
    .insert(positionShareTargets)
    .values({ key, userId: owner.id, data: { slab, market: snapshot.market } })
    .onConflictDoUpdate({
      target: positionShareTargets.key,
      set: { data: { slab, market: snapshot.market }, updatedAt: new Date() },
    });
  if (ref.source === "demo")
    await getDb()
      .update(positions)
      .set({
        data: sql`jsonb_set(${positions.data}, '{shareTarget}', ${JSON.stringify(slab)}::jsonb)`,
      })
      .where(and(eq(positions.id, ref.id), eq(positions.userId, owner.id)));
  return slab;
}
export async function prepareShare(
  owner: Owner,
  ref: ShareReference,
  showProfile: boolean,
) {
  const db = getDb();
  await db
    .delete(positionShareDrafts)
    .where(
      and(
        eq(positionShareDrafts.userId, owner.id),
        lt(positionShareDrafts.createdAt, new Date(Date.now() - 3600_000)),
      ),
    );
  const recent = await db
    .select({ token: positionShareDrafts.token })
    .from(positionShareDrafts)
    .where(
      and(
        eq(positionShareDrafts.userId, owner.id),
        gt(positionShareDrafts.createdAt, new Date(Date.now() - 60_000)),
      ),
    )
    .limit(15);
  if (recent.length >= 15)
    throw new ApiError(
      429,
      "Please wait a minute before preparing another image.",
    );
  const source = await authoritativeShare(owner, ref, showProfile);
  const rendered = await renderShare(source);
  const token = randomBytes(24).toString("hex");
  await db.insert(positionShareDrafts).values({
    token,
    userId: owner.id,
    reference: ref,
    fingerprint: snapshotFingerprint(source),
    ...rendered,
  });
  return { draft: token, ...rendered };
}
async function checkedDraft(owner: Owner, token: string) {
  const db = getDb();
  const [draft] = await db
    .select()
    .from(positionShareDrafts)
    .where(
      and(
        eq(positionShareDrafts.token, token),
        eq(positionShareDrafts.userId, owner.id),
      ),
    );
  if (!draft || Date.now() - draft.createdAt.getTime() > 3600_000)
    throw new ApiError(409, "Preview expired. Prepare the image again.");
  const snapshot = draft.snapshot as ShareSnapshot;
  const current = await authoritativeShare(
    owner,
    draft.reference as ShareReference,
    snapshot.identity.visible,
    snapshot.capturedAt,
    snapshot.identity,
  );
  return {
    draft,
    snapshot,
    valid: snapshotFingerprint(current) === draft.fingerprint,
  };
}
export async function validateShare(owner: Owner, token: string) {
  const { valid } = await checkedDraft(owner, token);
  return { valid };
}
export async function publishShare(owner: Owner, token: string) {
  const { draft, snapshot, valid } = await checkedDraft(owner, token);
  if (!valid)
    throw new ApiError(
      409,
      "Your position changed. Refresh the preview before sharing.",
    );
  await getDb()
    .insert(publicPositionShares)
    .values({ token, snapshot, png: draft.png })
    .onConflictDoNothing();
  return {
    url: `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/share/${token}`,
  };
}
export async function readPublicShare(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const [row] = await getDb()
    .select()
    .from(publicPositionShares)
    .where(eq(publicPositionShares.token, token));
  return row ? { snapshot: row.snapshot as ShareSnapshot, png: row.png } : null;
}
