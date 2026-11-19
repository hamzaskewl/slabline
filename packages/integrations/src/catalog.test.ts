import { expect, test } from "bun:test";
import { listCards, listRewardCards } from "./catalog";
import { DEMO_REPLAY, positionRewardMarket } from "@collectible/domain";

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

test("missing marketplace images do not hide the rest of the reward catalog", async () => {
  const original = globalThis.fetch;
  const card = {
    itemName: "Basketball card",
    category: "Basketball",
    grade: "10",
    gradingCompany: "PSA",
    listing: { price: 145, currency: "USDC" },
  };
  globalThis.fetch = (async () =>
    Response.json({
      filterNFtCard: [
        { ...card, id: "null-images", nftAddress: "null-images", images: null },
        {
          ...card,
          id: "null-sizes",
          nftAddress: "null-sizes",
          images: { frontM: null, frontS: null, backS: null },
        },
        {
          ...card,
          id: "has-image",
          nftAddress: "has-image",
          frontImage: "https://arweave.net/valid-image",
          images: null,
        },
      ],
      nextCursor: null,
    })) as unknown as typeof fetch;
  try {
    const cards = await listCards(
      `nullable-images-${crypto.randomUUID()}`,
      [],
      "mainnet",
    );
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.frontImage)).toEqual([
      null,
      null,
      "https://arweave.net/valid-image",
    ]);
    expect(cards.map((c) => c.ask)).toEqual(["145", "145", "145"]);
    expect(cards.every((c) => c.backImage === null)).toBe(true);
  } finally {
    globalThis.fetch = original;
  }
});

test("settled Spurs claims query relevant categories and keep only listed Spurs players", async () => {
  const original = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(
      new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      ),
    );
    return Response.json({
      filterNFtCard: [
        {
          id: "wemby",
          nftAddress: "wemby",
          itemName: "2023 Victor Wembanyama Hoops",
          category: "Basketball",
          grade: "10",
          gradingCompany: "PSA",
          images: null,
          listing: { price: 145, currency: "USDC" },
        },
        {
          id: "opponent",
          nftAddress: "opponent",
          itemName: "2003 Allen Iverson",
          category: "Basketball",
          grade: "10",
          gradingCompany: "PSA",
          images: null,
          listing: { price: 100, currency: "USDC" },
        },
      ],
      nextCursor: null,
    });
  }) as unknown as typeof fetch;
  try {
    const cards = await listRewardCards(
      positionRewardMarket({ ...DEMO_REPLAY, symbol: DEMO_REPLAY.book.symbol }),
    );
    expect(cards.map((c) => c.mint)).toEqual(["wemby"]);
    expect(cards[0]!.ask).toBe("145");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.searchParams.get("categories")).toContain("Basketball");
    expect(requests[0]!.searchParams.get("categories")).not.toContain(
      "Pokemon",
    );
  } finally {
    globalThis.fetch = original;
  }
});
