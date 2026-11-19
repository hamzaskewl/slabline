import { expect, test } from "bun:test";
import sharp from "sharp";
import {
  getDb,
  users,
  positions,
  fundingIntents,
  positionShareDrafts,
  publicPositionShares,
  positionShareTargets,
  eq,
} from "@collectible/db";
import {
  DEMO_REPLAY,
  DEMO_REPLAY_CARD,
  demoShareSnapshot,
  slabFromListing,
  shareIdentity,
} from "@collectible/domain";
import {
  authoritativeShare,
  prepareShare,
  publishShare,
  validateShare,
  readPublicShare,
  referenceKey,
  shareReferenceSchema,
  snapshotFingerprint,
} from "./position-share";
import { titleLines, textWidth } from "./share-text";
import { renderShare } from "./share-renderer";
import { safeShareImage } from "./share-image";

test("share references reject browser financial numbers and arbitrary asset URLs", () => {
  expect(
    shareReferenceSchema.safeParse({
      source: "demo",
      id: crypto.randomUUID(),
      payout: "999999",
    }).success,
  ).toBe(false);
  for (const image of [
    "https://localhost/test",
    "http://assets.gemini.com/test",
    "https://assets.gemini.com.evil.test/a",
    "https://secret@assets.gemini.com/a",
    "https://assets.gemini.com/a?token=private",
    "file:///private",
    "/../../private",
  ])
    expect(safeShareImage(image)).toBeNull();
  expect(
    safeShareImage("https://assets.gemini.com/predictions/team.png"),
  ).not.toBeNull();
});
test("targets retain their identity across Gemini settlement, and title wrapping uses actual display metrics", () => {
  const open = {
    source: "gemini" as const,
    kind: "position" as const,
    symbol: "GEMI-TEST",
    outcome: "yes",
    settledAt: null,
  };
  expect(referenceKey("owner", open)).toBe(
    referenceKey("owner", {
      ...open,
      kind: "settlement",
      settledAt: "2026-11-18T12:00:00Z",
    }),
  );
  expect(referenceKey("owner", open)).not.toBe(
    referenceKey("other-owner", open),
  );
  expect(referenceKey("owner", open)).not.toBe(
    referenceKey("owner", { ...open, outcome: "no" }),
  );
  const title = titleLines(
    "Will a very long market question with detailed conditions and an unusually long subject name remain inside exactly two lines?".repeat(
      3,
    ),
  );
  expect(title.lines).toHaveLength(2);
  for (const line of title.lines)
    expect(textWidth(line, title.size, 650)).toBeLessThanOrEqual(800);
});
test("the real renderer emits 1200×630 PNG and preserves a known slab on image failure", async () => {
  const p = {
    ...DEMO_REPLAY,
    artwork: [],
    id: "test",
    symbol: DEMO_REPLAY.book.symbol,
    state: "open",
    side: "yes" as const,
    quantity: "1000",
    cost: "350",
    replay: true,
    createdAt: "2026-11-18T12:00:00Z",
    shareTarget: {
      ...slabFromListing(DEMO_REPLAY_CARD),
      frontImage: "https://not-allowed.test/broken.jpg",
    },
  };
  const s = demoShareSnapshot(
    p,
    [],
    shareIdentity(false),
    "2026-11-18T12:00:00Z",
  );
  const result = await renderShare(s);
  const metadata = await sharp(Buffer.from(result.png, "base64")).metadata();
  expect([metadata.format, metadata.width, metadata.height]).toEqual([
    "png",
    1200,
    630,
  ]);
  expect(result.snapshot.slab).toMatchObject({
    name: DEMO_REPLAY_CARD.name,
    frontImage: null,
    role: "target",
  });
  expect(snapshotFingerprint(s)).toBe(
    snapshotFingerprint({ ...s, capturedAt: "another-capture-time" }),
  );
  expect(snapshotFingerprint(s)).not.toBe(
    snapshotFingerprint({ ...s, state: "won" }),
  );
});
test.skipIf(!process.env.DATABASE_URL)(
  "ownership, anonymous public data, immutability and stale-preview rejection in Postgres",
  async () => {
    const db = getDb();
    const failure = async (work: Promise<unknown>) => {
      try {
        await work;
        return "NO_ERROR";
      } catch (e) {
        return (e as Error).message;
      }
    };
    const owners = await db
      .insert(users)
      .values([
        { privyId: `share-test-${crypto.randomUUID()}` },
        { privyId: `share-test-${crypto.randomUUID()}` },
      ])
      .returning();
    const [a, b] = owners;
    if (!a || !b) throw new Error("Fixture setup failed");
    let published: string | undefined;
    try {
      const [p] = await db
        .insert(positions)
        .values({
          userId: a.id,
          idempotencyKey: `demo:position:${a.id}:${crypto.randomUUID()}`,
          state: "open",
          data: {
            ...DEMO_REPLAY,
            artwork: [],
            symbol: DEMO_REPLAY.book.symbol,
            side: "yes",
            quantity: "1000",
            cost: "350",
            replay: true,
            shareTarget: slabFromListing(DEMO_REPLAY_CARD),
          },
        })
        .returning();
      if (!p) throw new Error("Fixture position missing");
      const ref = { source: "demo" as const, id: p.id };
      expect(await failure(authoritativeShare(b, ref, false))).toContain(
        "Position not found",
      );
      const prepared = await prepareShare(a, ref, false);
      expect(await readPublicShare(prepared.draft)).toBeNull();
      expect(await validateShare(a, prepared.draft)).toEqual({ valid: true });
      expect(await failure(validateShare(b, prepared.draft))).toContain(
        "Preview expired",
      );
      expect(await failure(publishShare(b, prepared.draft))).toContain(
        "Preview expired",
      );
      const result = await publishShare(a, prepared.draft);
      published = prepared.draft;
      expect(result.url.endsWith(`/share/${prepared.draft}`)).toBe(true);
      const publicObject = await readPublicShare(prepared.draft);
      expect(publicObject?.png).toBe(prepared.png);
      expect(publicObject?.snapshot.identity).toEqual(shareIdentity(false));
      const data = JSON.stringify(publicObject);
      for (const secret of [a.id, a.privyId, p.id, '"balance"', '"wallet"'])
        expect(data).not.toContain(secret);
      await db
        .update(positions)
        .set({
          state: "won",
          data: { ...(p.data as object), payout: "1000", resolution: "yes" },
        })
        .where(eq(positions.id, p.id));
      expect(await failure(publishShare(a, prepared.draft))).toContain(
        "position changed",
      );
      expect(await validateShare(a, prepared.draft)).toEqual({ valid: false });
      expect((await readPublicShare(prepared.draft))?.snapshot.state).toBe(
        "open",
      );
      expect((await authoritativeShare(a, ref, false)).slab?.name).toBe(
        DEMO_REPLAY_CARD.name,
      );
    } finally {
      if (published)
        await db
          .delete(publicPositionShares)
          .where(eq(publicPositionShares.token, published));
      for (const owner of owners) {
        await db
          .delete(positionShareDrafts)
          .where(eq(positionShareDrafts.userId, owner.id));
        await db
          .delete(positionShareTargets)
          .where(eq(positionShareTargets.userId, owner.id));
        await db.delete(positions).where(eq(positions.userId, owner.id));
        await db
          .delete(fundingIntents)
          .where(eq(fundingIntents.userId, owner.id));
        await db.delete(users).where(eq(users.id, owner.id));
      }
    }
  },
  30000,
);
