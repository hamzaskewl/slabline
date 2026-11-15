import { expect, test } from "bun:test";
import { getDb, providerCache, eq } from "@collectible/db";
import { marketSnapshotStorage } from "./market-store";
import { SnapshotCache } from "./snapshot-cache";

test.skipIf(!process.env.DATABASE_URL)(
  "Postgres restores expired legacy market snapshots on a cold worker without waiting for Gemini",
  async () => {
    const key = `fixture:market-cache:${crypto.randomUUID()}`,
      now = Date.now(),
      observedAt = now - 120000;
    try {
      await getDb()
        .insert(providerCache)
        .values({
          key,
          data: ["saved catalog fixture"],
          updatedAt: new Date(observedAt),
          expiresAt: new Date(now - 60000),
        });
      const storage = marketSnapshotStorage<string[]>();
      const cold = new SnapshotCache(storage, 60000, () => now);
      const r = await cold.read(key, () => new Promise<string[]>(() => {}));
      expect(r.snapshot).toEqual({
        value: ["saved catalog fixture"],
        observedAt,
      });
      expect(r.stale).toBe(true);
      expect(r.refreshing).toBe(true);
      await storage.write(key, { value: ["updated fixture"], observedAt: now });
      const restarted = new SnapshotCache(storage, 60000, () => now);
      expect(
        (
          await restarted.read(key, async () => {
            throw new Error("Should not fetch");
          })
        ).snapshot?.value,
      ).toEqual(["updated fixture"]);
    } finally {
      await getDb().delete(providerCache).where(eq(providerCache.key, key));
    }
  },
);
