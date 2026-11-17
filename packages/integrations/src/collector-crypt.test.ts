import { expect, test } from "bun:test";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getTransactionEncoder,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import type { Listing } from "@collectible/domain";
import { buildCollectorCryptDevnetDraft } from "./collector-crypt";

// Invented transaction fixtures. Never signed or broadcast, no funds or ownership.
const buyer = "DJGsYNJWSM1PVo6EsiAv4989KdcVQABjuQ3iuFAAmjd";
const mint = "35NHmiFwQAetFg2Qa61BSAjA4LCrPrTqZ4g5MrfkHTMN";
const seller = "C7y6KXNnNU1Txo3ds3ZX6fG7RckWC6yQ4WaHMpNtksBr";
const program = "CcmRKTuZCGJBWQwMHvDYApBRvSZNHqGJXkznqpDTSQUr";
const card = (): Listing => ({
  id: "SIMULATED-CC-PREFLIGHT",
  mint,
  name: "Simulated preflight card",
  category: "Test",
  player: null,
  grade: "10",
  grader: "PSA",
  cert: "fixture",
  year: null,
  set: null,
  frontImage: null,
  backImage: null,
  ask: "20",
  currency: "USDC",
  seller,
  network: "devnet",
  source: "collectorcrypt",
  observedAt: new Date().toISOString(),
  valuation: null,
});
const market = () => ({
  nftAddress: mint,
  listing: {
    price: "20.000000",
    currency: "USDC",
    marketplace: "CC",
    status: "Active",
  },
  owner: { wallet: seller },
  nftStatus: "Valid",
  inSwap: false,
  activeSwapId: null,
  inAuction: false,
  burnedForBridge: false,
});

function transaction(
  options: {
    payer?: string;
    asset?: string;
    program?: string;
    extraSigner?: boolean;
  } = {},
) {
  const message = setTransactionMessageLifetimeUsingBlockhash(
    {
      blockhash: blockhash("11111111111111111111111111111111"),
      lastValidBlockHeight: 1n,
    },
    setTransactionMessageFeePayer(
      address(options.payer ?? buyer),
      createTransactionMessage({ version: "legacy" }),
    ),
  );
  const tx = compileTransaction(
    appendTransactionMessageInstructions(
      [
        {
          programAddress: address(options.program ?? program),
          accounts: [
            {
              address: address(options.asset ?? mint),
              role: AccountRole.WRITABLE,
            },
            { address: address(buyer), role: AccountRole.WRITABLE_SIGNER },
            ...(options.extraSigner
              ? [
                  {
                    address: address(seller),
                    role: AccountRole.READONLY_SIGNER,
                  },
                ]
              : []),
          ],
          data: new Uint8Array([1]),
        },
      ],
      message,
    ),
  );
  return Buffer.from(getTransactionEncoder().encode(tx)).toString("base64");
}
function provider(
  state: unknown = market(),
  draft = transaction(),
  stateStatus = 200,
) {
  const calls: { url: string; options?: RequestInit }[] = [];
  const fetcher = (async (input: string, options?: RequestInit) => {
    calls.push({ url: String(input), options });
    return calls.length === 1
      ? Response.json(state, { status: stateStatus })
      : new Response(draft, { status: 201 });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

test("devnet draft rechecks the exact listing without cache and stays unapproved for signing", async () => {
  const { calls, fetcher } = provider();
  const result = await buildCollectorCryptDevnetDraft(card(), buyer, fetcher);
  expect(result.inspection).toBe("required");
  expect(result.review).toMatchObject({
    buyer,
    mint,
    seller,
    price: "20",
    feePayer: buyer,
    requiredSigners: [buyer],
    programs: [program],
  });
  expect(calls.map((c) => c.url)).toEqual([
    `https://dev-api.collectorcrypt.com/cards/publicNft/${mint}/market`,
    "https://dev-api.collectorcrypt.com/marketplace/buy",
  ]);
  expect(
    calls.every(
      (c) => c.options?.cache === "no-store" && c.options.redirect === "error",
    ),
  ).toBe(true);
  expect(JSON.parse(String(calls[1]!.options!.body))).toEqual({
    wallet: buyer,
    nftAddress: mint,
    price: 20,
    isV2Listing: true,
  });
  const quoted = provider(market(), JSON.stringify(transaction()));
  expect(
    (await buildCollectorCryptDevnetDraft(card(), buyer, quoted.fetcher))
      .unsignedBase64,
  ).toBe(transaction());
});

test("changed, missing, swapped and invalid listings never reach the builder", async () => {
  const states = [
    { ...market(), nftAddress: seller },
    { ...market(), owner: { wallet: buyer } },
    { ...market(), listing: { ...market().listing, price: "20.000001" } },
    { ...market(), listing: null },
    { ...market(), inSwap: true },
    { ...market(), nftStatus: "Burned" },
    { ...market(), burnedForBridge: true },
  ];
  for (const state of states) {
    const { calls, fetcher } = provider(state);
    await expect(
      buildCollectorCryptDevnetDraft(card(), buyer, fetcher),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  }
  const missing = provider({}, transaction(), 404);
  await expect(
    buildCollectorCryptDevnetDraft(card(), buyer, missing.fetcher),
  ).rejects.toThrow("listing HTTP 404");
  expect(missing.calls).toHaveLength(1);
});

test("mainnet, stale listings, unknown seller and own purchases cannot make provider calls", async () => {
  for (const patch of [
    { network: "mainnet" },
    { observedAt: "2020-01-01T00:00:00Z" },
    { seller: null },
    { seller: buyer },
    { mint: "invalid" },
  ]) {
    const { calls, fetcher } = provider();
    await expect(
      buildCollectorCryptDevnetDraft(
        { ...card(), ...patch } as Listing,
        buyer,
        fetcher,
      ),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  }
});

test("sponsorship and extra signer requirements cannot slip into the devnet draft", async () => {
  for (const options of [{ payer: seller }, { extraSigner: true }]) {
    const { fetcher } = provider(market(), transaction(options));
    await expect(
      buildCollectorCryptDevnetDraft(card(), buyer, fetcher),
    ).rejects.toThrow("sponsorship or additional signers are disabled");
  }
});

test("malformed transactions, substituted assets and unexpected programs are rejected", async () => {
  for (const draft of [
    Buffer.alloc(100).toString("base64"),
    transaction({ asset: seller }),
    transaction({ program: "11111111111111111111111111111111" }),
  ]) {
    const { fetcher } = provider(market(), draft);
    await expect(
      buildCollectorCryptDevnetDraft(card(), buyer, fetcher),
    ).rejects.toThrow();
  }
});
