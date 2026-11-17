import { expect, test } from "bun:test";
import { generateKeyPairSigner } from "@solana/kit";
import { geminiReadiness } from "./gemini-private";
import { solanaUsdcMint, SOLANA_USDC_MINTS, SOLANA_GENESIS } from "./solana";
import {
  normalizeWalletCollection,
  getWalletCollection,
} from "./wallet-collection";
import { getDb, users, walletLinks, providerCache, eq } from "@collectible/db";
function saveEnv(names: string[]) {
  const prior = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  return () => {
    for (const n of names)
      if (prior[n] === undefined) delete process.env[n];
      else process.env[n] = prior[n];
  };
}
test("Gemini readiness never bypasses production approval, credentials or granted read scopes", () => {
  const restore = saveEnv([
    "GEMINI_OAUTH_CLIENT_ID",
    "GEMINI_OAUTH_CLIENT_SECRET",
    "TOKEN_ENCRYPTION_KEY",
    "GEMINI_ENVIRONMENT",
    "GEMINI_OAUTH_PRODUCTION_APPROVED",
  ]);
  try {
    process.env.GEMINI_ENVIRONMENT = "production";
    process.env.GEMINI_OAUTH_CLIENT_ID = "SIMULATED";
    process.env.GEMINI_OAUTH_CLIENT_SECRET = "SIMULATED";
    process.env.TOKEN_ENCRYPTION_KEY = "SIMULATED";
    process.env.GEMINI_OAUTH_PRODUCTION_APPROVED = "false";
    expect(
      geminiReadiness(true, ["balances:read", "orders:read"]).canRead,
    ).toBe(false);
    expect(geminiReadiness(true, []).blocker).toContain("approval");
    process.env.GEMINI_OAUTH_PRODUCTION_APPROVED = "true";
    expect(geminiReadiness(false, []).canConnect).toBe(true);
    expect(geminiReadiness(false, []).canRead).toBe(false);
    expect(geminiReadiness(true, ["balances:read"]).canRead).toBe(false);
    expect(
      geminiReadiness(true, ["balances:read", "orders:read"]).canRead,
    ).toBe(true);
    delete process.env.GEMINI_OAUTH_CLIENT_SECRET;
    expect(
      geminiReadiness(true, ["balances:read", "orders:read"]).canConnect,
    ).toBe(false);
  } finally {
    restore();
  }
});
test("Wallet USDC is native to the active network, never Collector Crypt's different test token", () => {
  const restore = saveEnv(["SOLANA_NETWORK", "SOLANA_USDC_MINT"]);
  try {
    delete process.env.SOLANA_USDC_MINT;
    process.env.SOLANA_NETWORK = "devnet";
    expect(solanaUsdcMint()).toBe(SOLANA_USDC_MINTS.devnet);
    process.env.SOLANA_USDC_MINT =
      "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";
    expect(solanaUsdcMint).toThrow("native USDC");
    process.env.SOLANA_NETWORK = "mainnet";
    process.env.SOLANA_USDC_MINT = SOLANA_USDC_MINTS.devnet;
    expect(solanaUsdcMint).toThrow();
  } finally {
    restore();
  }
});
test("DAS collection excludes foreign owners, burned assets, fungible tokens, duplicates and unsafe images", async () => {
  const keys = await Promise.all(
    Array.from({ length: 6 }, () => generateKeyPairSigner()),
  );
  const owner = keys[0]!.address,
    other = keys[1]!.address;
  const asset = (id: string) => ({
    id,
    interface: "MplCoreAsset",
    ownership: { owner },
    content: {
      metadata: { name: "SIMULATED owned card" },
      links: { image: "https://nft-dev.collectorcrypt.com/front/test" },
    },
  });
  const good = asset(keys[2]!.address),
    badImage = asset(keys[3]!.address);
  badImage.content.links.image = "javascript:alert(1)";
  const result = normalizeWalletCollection(
    {
      result: {
        page: 1,
        items: [
          good,
          good,
          { ...asset(keys[4]!.address), ownership: { owner: other } },
          { ...good, burnt: true },
          { ...good, interface: "FungibleToken" },
          badImage,
        ],
      },
    },
    owner,
    "devnet",
    1,
  );
  expect(result.assets).toHaveLength(2);
  expect(result.assets[0]!.imageUrl).toContain("nft-dev.collectorcrypt.com");
  expect(result.assets[1]!.imageUrl).toBeNull();
  expect(result.hasMore).toBe(false);
  expect(() =>
    normalizeWalletCollection(
      { result: { items: [], page: 2 } },
      owner,
      "devnet",
      1,
    ),
  ).toThrow();
  expect(() =>
    normalizeWalletCollection(
      { error: { message: "upstream down" } },
      owner,
      "devnet",
      1,
    ),
  ).toThrow();
});
test.skipIf(!process.env.DATABASE_URL)(
  "Wallet collection authorizes the user and network before using cached ownership data",
  async () => {
    const db = getDb(),
      restore = saveEnv(["SOLANA_NETWORK", "QUICKNODE_DAS_RPC_URL"]),
      original = globalThis.fetch;
    const wallet = (await generateKeyPairSigner()).address,
      mint = (await generateKeyPairSigner()).address;
    const [a, b] = await db
      .insert(users)
      .values([
        { privyId: `SIMULATED-DAS-A-${crypto.randomUUID()}` },
        { privyId: `SIMULATED-DAS-B-${crypto.randomUUID()}` },
      ])
      .returning();
    if (!a || !b) throw new Error("Fixture setup");
    let calls = 0;
    try {
      process.env.SOLANA_NETWORK = "devnet";
      process.env.QUICKNODE_DAS_RPC_URL = `https://das-fixture.invalid/${crypto.randomUUID()}`;
      globalThis.fetch = (async (
        input: string | URL | Request,
        init?: RequestInit,
      ) => {
        calls++;
        const body = JSON.parse(
          input instanceof Request ? await input.text() : String(init?.body),
        );
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result:
            body.method === "getGenesisHash"
              ? SOLANA_GENESIS.devnet
              : {
                  page: 1,
                  items: [
                    {
                      id: mint,
                      interface: "MplCoreAsset",
                      ownership: { owner: wallet },
                    },
                  ],
                },
        });
      }) as typeof fetch;
      await db.insert(walletLinks).values({
        userId: a.id,
        address: wallet,
        network: "devnet",
        verifiedAt: new Date(),
      });
      expect((await getWalletCollection(a.id, wallet)).assets[0]!.mint).toBe(
        mint,
      );
      const readCalls = calls;
      await getWalletCollection(a.id, wallet);
      expect(calls).toBe(readCalls);
      await expect(getWalletCollection(b.id, wallet)).rejects.toThrow("Verify");
      expect(calls).toBe(readCalls);
      process.env.SOLANA_NETWORK = "mainnet";
      await expect(getWalletCollection(a.id, wallet)).rejects.toThrow("Verify");
      expect(calls).toBe(readCalls);
    } finally {
      globalThis.fetch = original;
      restore();
      await db
        .delete(providerCache)
        .where(
          eq(providerCache.key, `wallet-collection:v1:devnet:${wallet}:1`),
        );
      await db.delete(walletLinks).where(eq(walletLinks.userId, a.id));
      await db.delete(users).where(eq(users.id, a.id));
      await db.delete(users).where(eq(users.id, b.id));
    }
  },
);
