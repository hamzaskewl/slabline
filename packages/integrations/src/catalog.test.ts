import { expect, test } from "bun:test";
import { listCards } from "./catalog";

test("Collector Crypt follows cursors and retains asks above the old cap", async () => {
  const original = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    requests.push(url);
    const second = url.searchParams.has("cursor");
    return Response.json({
      filterNFtCard: [
        {
          id: second ? "b" : "a",
          nftAddress: second ? "mint-b" : "mint-a",
          itemName: "Basketball card",
          category: "Basketball",
          grade: "10",
          gradingCompany: "PSA",
          listing: { price: second ? 20 : 5000, currency: "USDC" },
        },
      ],
      nextCursor: second ? null : "opaque-cursor",
    });
  }) as unknown as typeof fetch;
  try {
    const cards = await listCards(`pagination-test-${crypto.randomUUID()}`);
    expect(cards.map((c) => c.ask)).toEqual(["5000", "20"]);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.searchParams.get("orderBy")).toBe("listedPriceDesc");
    expect(requests[0]!.searchParams.has("listPriceMax")).toBe(false);
    expect(requests[1]!.searchParams.get("cursor")).toBe("opaque-cursor");
  } finally {
    globalThis.fetch = original;
  }
});

test("failed later card pages do not present partial inventory as complete", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () =>
    ++calls === 1
      ? Response.json({ filterNFtCard: [], nextCursor: "next" })
      : new Response("Unavailable", {
          status: 503,
        })) as unknown as typeof fetch;
  try {
    await expect(
      listCards(`failure-test-${crypto.randomUUID()}`),
    ).rejects.toThrow("503");
  } finally {
    globalThis.fetch = original;
  }
});
