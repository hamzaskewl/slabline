import { test, expect } from "bun:test";
import { SnapshotCache, type Snapshot } from "./snapshot-cache";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
test("an expired persisted snapshot renders before a blocked provider completes, including after restart", async () => {
  let now = 100000,
    loads = 0;
  let saved: Snapshot<string[]> = { value: ["saved market"], observedAt: 1000 };
  const storage = {
    read: async () => saved,
    write: async (_: string, s: Snapshot<string[]>) => {
      saved = s;
    },
  };
  let finish!: (v: string[]) => void;
  const load = () => {
    loads++;
    return new Promise<string[]>((resolve) => {
      finish = resolve;
    });
  };
  const cache = new SnapshotCache(storage, 60000, () => now);
  const first = await cache.read("catalog", load);
  expect(first.snapshot).toEqual(saved);
  expect(first.refreshing).toBe(true);
  expect(first.stale).toBe(true);
  await Promise.all(
    Array.from({ length: 20 }, () => cache.read("catalog", load)),
  );
  cache.refreshDue();
  expect(loads).toBe(1);
  finish(["new market"]);
  await tick();
  expect((await cache.read("catalog", load)).snapshot?.observedAt).toBe(now);
  const restarted = new SnapshotCache(storage, 60000, () => now);
  expect((await restarted.read("catalog", load)).snapshot?.value).toEqual([
    "new market",
  ]);
  expect(loads).toBe(1);
});

test("provider failure retains original snapshot time and backs off while the scheduler recovers", async () => {
  let now = 100000,
    loads = 0,
    failed = true;
  const cache = new SnapshotCache(
    {
      read: async () => ({ value: ["saved"], observedAt: 1000 }),
      write: async () => {},
    },
    60000,
    () => now,
  );
  const load = async () => {
    loads++;
    if (failed) throw new Error("offline");
    return ["recovered"];
  };
  await cache.read("catalog", load);
  await tick();
  const failedRead = await cache.read("catalog", load);
  expect(failedRead.snapshot?.value).toEqual(["saved"]);
  expect(failedRead.snapshot?.observedAt).toBe(1000);
  expect(failedRead.error).toContain("delayed");
  cache.refreshDue();
  expect(loads).toBe(1);
  now += 30001;
  failed = false;
  cache.refreshDue();
  await tick();
  expect((await cache.read("catalog", load)).snapshot?.value).toEqual([
    "recovered",
  ]);
  expect(loads).toBe(2);
});

test("empty cache returns immediately and does not fabricate markets or refresh timestamps", async () => {
  let finish!: (v: string[]) => void;
  const cache = new SnapshotCache<string[]>(
    { read: async () => null, write: async () => {} },
    60000,
  );
  const first = await cache.read(
    "new",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  expect(first.snapshot).toBeNull();
  expect(first.refreshing).toBe(true);
  finish([]);
  await tick();
  expect((await cache.read("new", async () => [])).snapshot?.value).toEqual([]);
});

test("a sustained outage backs off to five minutes and a successful refresh resets the delay", async () => {
  let now = 100000,
    loads = 0,
    failed = true;
  const cache = new SnapshotCache(
    {
      read: async () => ({ value: ["saved"], observedAt: 1000 }),
      write: async () => {},
    },
    60000,
    () => now,
  );
  const load = async () => {
    loads++;
    if (failed) throw new Error("offline");
    return ["recovered"];
  };
  await cache.read("catalog", load);
  await tick();
  for (const delay of [30000, 60000, 120000, 240000, 300000, 300000]) {
    const before = loads;
    now += delay - 1;
    cache.refreshDue();
    await tick();
    expect(loads).toBe(before);
    const saved = await cache.read("catalog", load);
    expect(saved.snapshot).toEqual({ value: ["saved"], observedAt: 1000 });
    now++;
    cache.refreshDue();
    await tick();
    expect(loads).toBe(before + 1);
  }
  failed = false;
  now += 300000;
  await cache.read("catalog", load);
  await tick();
  expect((await cache.read("catalog", load)).snapshot?.value).toEqual([
    "recovered",
  ]);
  failed = true;
  now += 60001;
  await cache.read("catalog", load);
  await tick();
  const before = loads;
  now += 30000;
  cache.refreshDue();
  await tick();
  expect(loads).toBe(before + 1);
});

test("ancient snapshots expire and newer event data wins over older catalog seeds", async () => {
  const now = 8 * 86400000;
  const cache = new SnapshotCache<string>(
    {
      read: async () => ({ value: "ancient", observedAt: 1 }),
      write: async () => {},
    },
    60000,
    () => now,
  );
  const noLoad = () => new Promise<string>(() => {});
  expect((await cache.read("old", noLoad)).snapshot).toBeNull();
  expect(
    (await cache.read("event", noLoad, { value: "fresh", observedAt: now }))
      .snapshot?.value,
  ).toBe("fresh");
  expect(
    (
      await cache.read("event", noLoad, {
        value: "older",
        observedAt: now - 1000,
      })
    ).snapshot?.value,
  ).toBe("fresh");
});
