import { z } from "zod";
const base = process.argv[2] ?? "http://localhost:4001";
async function read(path: string) {
  const response = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json() as Promise<{ source: string; data: unknown }>;
}
const [markets, cards, packs] = await Promise.all([
  read("/markets"),
  read("/cards"),
  read("/packs"),
]);
const catalog = z
  .array(
    z.object({
      id: z.string(),
      ticker: z.string().optional(),
      contracts: z.array(z.object({ symbol: z.string() })),
    }),
  )
  .parse(markets.data);
const listings = z
  .array(
    z.object({
      mint: z.string(),
      frontImage: z.string().nullable(),
      currency: z.literal("USDC"),
      grade: z.string(),
      grader: z.string(),
    }),
  )
  .parse(cards.data);
if (
  markets.source !== "live" ||
  cards.source !== "live" ||
  !catalog.length ||
  !listings.length
)
  throw new Error("Public provider reads did not return live catalog data");
const first = catalog.find((m) => m.contracts.length);
if (!first) throw new Error("No active contract to stream");
const detail = await read(
  `/market?id=${encodeURIComponent(first.ticker ?? first.id)}`,
);
if (!detail.data) throw new Error("Direct event lookup failed");
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 20000);
let hasSnapshot = false;
try {
  const response = await fetch(
    `${base}/events?symbol=${encodeURIComponent(first.contracts[0]!.symbol)}`,
    { signal: controller.signal },
  );
  if (!response.ok || !response.body) throw new Error("SSE unavailable");
  const reader = response.body.getReader();
  let buffer = "";
  while (!hasSnapshot) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += new TextDecoder().decode(chunk.value);
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      if (!frame.startsWith("data: ")) continue;
      const payload = JSON.parse(frame.slice(6));
      if (
        payload.book &&
        !payload.book.stale &&
        (payload.book.asks.length || payload.book.bids.length)
      ) {
        hasSnapshot = true;
        break;
      }
    }
  }
  await reader.cancel();
} finally {
  clearTimeout(timer);
  controller.abort();
}
if (!hasSnapshot) throw new Error("No fresh Gemini SSE book snapshot received");
console.log(
  JSON.stringify({
    test: "real-public-catalog-and-SSE",
    marketCount: catalog.length,
    gradedUSDCListings: listings.length,
    providerImageCount: listings.filter((l) => l.frontImage).length,
    phygitalsSource: packs.source,
    geminiBookSnapshot: true,
    financialActions: false,
  }),
);
