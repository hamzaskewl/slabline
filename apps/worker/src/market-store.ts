import {
  getDb,
  providerCache,
  markets as marketTable,
  contracts as contractTable,
  eq,
  sql,
} from "@collectible/db";
import { listMarkets, getMarketByTicker } from "@collectible/integrations";
import type {
  Market,
  ProviderResult,
  MarketStatusFilter,
} from "@collectible/domain";
import { SnapshotCache, type Snapshot } from "./snapshot-cache";

// Refresh old snapshots that predate provider live/resolution metadata.
const catalogKey = "gemini:markets:v7:all-active-categories";
const flatten = (items: Market[]): Market[] =>
  items.flatMap((m) => [m, ...flatten(m.children)]);
const known = new Map<string, Market>();
const remember = (items: Market[]) => {
  for (const m of flatten(items)) {
    known.set(m.id, m);
    if (m.ticker) known.set(m.ticker, m);
  }
};

async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Snapshot database timeout")),
          1500,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export function marketSnapshotStorage<T>() {
  return {
    async read(key: string): Promise<Snapshot<T> | null> {
      if (!process.env.DATABASE_URL) return null;
      const [row] = await bounded(
        getDb()
          .select()
          .from(providerCache)
          .where(eq(providerCache.key, key))
          .limit(1),
      );
      return row
        ? { value: row.data as T, observedAt: row.updatedAt.getTime() }
        : null;
    },
    async write(key: string, s: Snapshot<T>) {
      if (!process.env.DATABASE_URL) return;
      await bounded(
        getDb()
          .insert(providerCache)
          .values({
            key,
            data: s.value,
            updatedAt: new Date(s.observedAt),
            expiresAt: new Date(s.observedAt + 60000),
          })
          .onConflictDoUpdate({
            target: providerCache.key,
            set: {
              data: s.value,
              updatedAt: new Date(s.observedAt),
              expiresAt: new Date(s.observedAt + 60000),
            },
          }),
      );
    },
  };
}
const catalogs = new SnapshotCache<Market[]>(marketSnapshotStorage(), 60000);
const archiveCatalogs = new SnapshotCache<Market[]>(
  marketSnapshotStorage(),
  300000,
);
const events = new SnapshotCache<Market>(marketSnapshotStorage(), 30000);
let indexedCatalog: Market[] | null = null;
function indexCatalog(data: Market[]) {
  if (indexedCatalog === data) return;
  indexedCatalog = data;
  known.clear();
  remember(data);
}

async function persistMetadata(data: Market[]) {
  if (!process.env.DATABASE_URL) return;
  const rows = [...new Map(flatten(data).map((m) => [m.id, m])).values()];
  try {
    for (let i = 0; i < rows.length; i += 500)
      await getDb()
        .insert(marketTable)
        .values(
          rows.slice(i, i + 500).map((m) => ({
            id: m.id,
            provider: "gemini",
            category: m.category,
            status: m.status,
            data: m,
          })),
        )
        .onConflictDoUpdate({
          target: marketTable.id,
          set: {
            data: sql`excluded.data`,
            status: sql`excluded.status`,
            updatedAt: new Date(),
          },
        });
    const contracts = [
      ...new Map(
        rows
          .flatMap((m) =>
            m.contracts.map((c) => ({
              symbol: c.symbol,
              marketId: m.id,
              data: c,
            })),
          )
          .map((c) => [c.symbol, c]),
      ).values(),
    ];
    for (let i = 0; i < contracts.length; i += 500)
      await getDb()
        .insert(contractTable)
        .values(contracts.slice(i, i + 500))
        .onConflictDoUpdate({
          target: contractTable.symbol,
          set: { data: sql`excluded.data` },
        });
  } catch {
    console.warn("Market metadata persistence unavailable");
  }
}
async function loadCatalog() {
  const data = await listMarkets();
  indexCatalog(data);
  // Storage maintenance cannot delay discovery or a new live-book subscription.
  void persistMetadata(data);
  return data;
}
function result<T>(
  r: {
    snapshot: Snapshot<T> | null;
    refreshing: boolean;
    stale: boolean;
    error: string | null;
  },
  empty: T,
): ProviderResult<T> {
  return {
    data: r.snapshot?.value ?? empty,
    source: r.snapshot ? "cache" : "unavailable",
    observedAt: r.snapshot ? new Date(r.snapshot.observedAt).toISOString() : "",
    refreshing: r.refreshing,
    stale: r.stale,
    error: r.error,
  };
}
export async function savedMarkets(
  status: MarketStatusFilter = "active",
): Promise<ProviderResult<Market[]>> {
  if (status === "all") {
    const [active, resolved] = await Promise.all([
      savedMarkets("active"),
      savedMarkets("resolved"),
    ]);
    return {
      data: [
        ...new Map(
          [...active.data, ...resolved.data].map((m) => [m.id, m]),
        ).values(),
      ],
      source:
        active.data.length || resolved.data.length ? "cache" : "unavailable",
      observedAt:
        [active.observedAt, resolved.observedAt].filter(Boolean).sort()[0] ??
        "",
      refreshing: active.refreshing || resolved.refreshing,
      stale: active.stale || resolved.stale,
      error: active.error || resolved.error,
    };
  }
  const r = await (status === "active" ? catalogs : archiveCatalogs).read(
    status === "active" ? catalogKey : `gemini:markets:v1:${status}`,
    status === "active"
      ? loadCatalog
      : () => listMarkets(undefined, undefined, status),
  );
  if (r.snapshot && status === "active") indexCatalog(r.snapshot.value);
  return result(r, []);
}
export async function savedMarket(
  id: string,
): Promise<ProviderResult<Market | null>> {
  const catalog = await savedMarkets();
  let seed = flatten(catalog.data).find((m) => m.id === id || m.ticker === id);
  let observedAt = catalog.observedAt ? Date.parse(catalog.observedAt) : 0;
  if (!seed && /^\d+$/.test(id) && process.env.DATABASE_URL) {
    try {
      const [row] = await bounded(
        getDb()
          .select()
          .from(marketTable)
          .where(eq(marketTable.id, id))
          .limit(1),
      );
      if (row) {
        seed = row.data as Market;
        observedAt = row.updatedAt.getTime();
      }
    } catch {}
  }
  const ticker = seed?.ticker ?? (!/^\d+$/.test(id) ? id : null);
  if (!ticker) return { ...catalog, data: seed ?? null };
  const r = await events.read(
    `gemini:event:v2:${ticker}`,
    async () => {
      const market = await getMarketByTicker(ticker);
      remember([market]);
      return market;
    },
    seed ? { value: seed, observedAt } : null,
  );
  if (r.snapshot) remember([r.snapshot.value]);
  return result<Market | null>(r, null);
}
export function knownMarkets() {
  return [...new Map([...known.values()].map((m) => [m.id, m])).values()];
}
export async function savedContract(symbol: string) {
  if (!known.size) await savedMarkets();
  return knownMarkets()
    .flatMap((m) => m.contracts)
    .find((c) => c.symbol === symbol);
}
export function startMarketRefresh() {
  void savedMarkets();
  return setInterval(() => {
    void savedMarkets();
    events.refreshDue();
  }, 15000);
}
