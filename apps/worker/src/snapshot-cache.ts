/** Read-only discovery snapshots. Never use this cache for balances, orders or books. */
import { publicProviderError } from "@collectible/integrations";

export type Snapshot<T> = { value: T; observedAt: number };
type Storage<T> = {
  read(key: string): Promise<Snapshot<T> | null>;
  write(key: string, snapshot: Snapshot<T>): Promise<void>;
};
type Entry<T> = {
  snapshot: Snapshot<T> | null;
  hydrated: boolean;
  hydrate?: Promise<void>;
  refresh?: Promise<void>;
  load: () => Promise<T>;
  retryAt: number;
  failures: number;
  lastAccess: number;
  error: string | null;
};
export class SnapshotCache<T> {
  private entries = new Map<string, Entry<T>>();
  constructor(
    private storage: Storage<T>,
    private ttl: number,
    private now = Date.now,
  ) {}
  private usable(snapshot: Snapshot<T> | null) {
    return snapshot &&
      snapshot.observedAt <= this.now() &&
      this.now() - snapshot.observedAt < 7 * 86400000
      ? snapshot
      : null;
  }
  async read(key: string, load: () => Promise<T>, seed?: Snapshot<T> | null) {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        snapshot: null,
        hydrated: false,
        load,
        retryAt: 0,
        failures: 0,
        lastAccess: this.now(),
        error: null,
      };
      this.entries.set(key, entry);
      // Bound memory without evicting an in-flight operation.
      if (this.entries.size > 200) {
        const oldest = [...this.entries].find(
          ([k, e]) => k !== key && !e.refresh && !e.hydrate,
        );
        if (oldest) this.entries.delete(oldest[0]);
      }
    }
    const e = entry;
    e.lastAccess = this.now();
    if (
      seed &&
      this.usable(seed) &&
      (!e.snapshot || seed.observedAt > e.snapshot.observedAt)
    )
      e.snapshot = seed;
    if (!e.hydrated) {
      e.hydrate ??= (async () => {
        try {
          const stored = this.usable(await this.storage.read(key));
          if (
            stored &&
            (!e.snapshot || stored.observedAt > e.snapshot.observedAt)
          )
            e.snapshot = stored;
        } catch {
          /* An unavailable database must not suppress the provider refresh. */
        }
        e.hydrated = true;
      })().finally(() => {
        e.hydrate = undefined;
      });
      await e.hydrate;
    }
    e.snapshot = this.usable(e.snapshot);
    this.refreshIfDue(key, e);
    return {
      snapshot: e.snapshot,
      refreshing: !!e.refresh,
      stale: !e.snapshot || this.now() - e.snapshot.observedAt >= this.ttl,
      error: e.error,
    };
  }
  private refreshIfDue(key: string, e: Entry<T>) {
    if (
      e.refresh ||
      this.now() < e.retryAt ||
      (e.snapshot && this.now() - e.snapshot.observedAt < this.ttl)
    )
      return;
    e.refresh = (async () => {
      try {
        const value = await e.load();
        const snapshot = { value, observedAt: this.now() };
        e.snapshot = snapshot;
        e.error = null;
        e.failures = 0;
        e.retryAt = 0;
        try {
          await this.storage.write(key, snapshot);
        } catch {
          console.warn("Discovery snapshot persistence unavailable");
        }
      } catch (error) {
        console.warn(
          "Gemini discovery refresh failed",
          publicProviderError(error),
        );
        e.error = "Gemini refresh is delayed.";
        e.failures = Math.min(e.failures + 1, 5);
        e.retryAt =
          this.now() + Math.min(300000, 30000 * 2 ** (e.failures - 1));
      }
    })().finally(() => {
      e.refresh = undefined;
    });
  }
  refreshDue() {
    for (const [key, e] of this.entries)
      if (this.now() - e.lastAccess < 10 * 60000) this.refreshIfDue(key, e);
  }
}
