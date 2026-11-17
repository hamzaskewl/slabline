import {
  IntegrationBlocked,
  assertFreshListing,
  units,
  type Listing,
} from "@collectible/domain";
import {
  address,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
} from "@solana/kit";
import { z } from "zod";

const base = "https://dev-api.collectorcrypt.com";
const marketplaceProgram = "CcmRKTuZCGJBWQwMHvDYApBRvSZNHqGJXkznqpDTSQUr";
const computeBudgetProgram = "ComputeBudget111111111111111111111111111111";
const headers = {
  "Content-Type": "application/json",
  "User-Agent": "CollectibleMarkets/1.0",
};
const liveMarket = z.object({
  nftAddress: z.string(),
  listing: z.object({
    price: z.union([z.string(), z.number()]).transform(String),
    currency: z.literal("USDC"),
    marketplace: z.literal("CC"),
    status: z.literal("Active"),
  }),
  owner: z.object({ wallet: z.string() }),
  nftStatus: z.literal("Valid"),
  inSwap: z.literal(false),
  activeSwapId: z.null(),
  inAuction: z.literal(false),
  burnedForBridge: z.literal(false),
});

export type CollectorCryptDraft = {
  unsignedBase64: string;
  network: "devnet";
  // These checks are not full instruction/account inspection or permission to sign.
  inspection: "required";
  review: {
    buyer: string;
    mint: string;
    seller: string;
    price: string;
    feePayer: string;
    requiredSigners: string[];
    programs: string[];
    checkedAt: string;
  };
};

export async function buildCollectorCryptDevnetDraft(
  card: Listing,
  buyer: string,
  fetcher: typeof fetch = fetch,
): Promise<CollectorCryptDraft> {
  assertFreshListing(card);
  if (card.network !== "devnet")
    throw new IntegrationBlocked(
      "Collector Crypt",
      "Mainnet purchase builders are disabled until signed devnet tests and instruction inspection pass",
    );
  if (card.source !== "collectorcrypt" || card.currency !== "USDC")
    throw new Error("Unsupported listing source or currency");
  address(buyer);
  address(card.mint);
  if (!card.seller) throw new Error("Listing seller is unverified");
  address(card.seller);
  if (buyer === card.seller) throw new Error("Cannot buy your own listing");
  const expected = units(card.ask);
  const price = Number(card.ask);
  if (
    !Number.isFinite(price) ||
    price > 999999999 ||
    units(String(price)) !== expected
  )
    throw new Error("Price cannot be represented exactly by the provider API");

  // Purchase preparation must bypass the catalog/cache: availability and ask can change.
  const stateResponse = await fetcher(
    `${base}/cards/publicNft/${card.mint}/market`,
    {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!stateResponse.ok)
    throw new Error(`Collector Crypt listing HTTP ${stateResponse.status}`);
  const market = liveMarket.parse(await stateResponse.json());
  if (
    market.nftAddress !== card.mint ||
    market.owner.wallet !== card.seller ||
    units(market.listing.price) !== expected
  )
    throw new Error(
      "Listing changed; refresh price and availability before continuing",
    );

  const response = await fetcher(`${base}/marketplace/buy`, {
    method: "POST",
    headers,
    cache: "no-store",
    redirect: "error",
    body: JSON.stringify({
      wallet: buyer,
      nftAddress: card.mint,
      price,
      isV2Listing: true,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`Collector Crypt builder HTTP ${response.status}`);
  let body: unknown = await response.text();
  if (typeof body === "string" && body.startsWith('"')) body = JSON.parse(body);
  const unsignedBase64 = z
    .string()
    .min(64)
    .max(4096)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .parse(body);
  const bytes = Buffer.from(unsignedBase64, "base64");
  if (bytes.length > 1232 || bytes.toString("base64") !== unsignedBase64)
    throw new Error("Invalid transaction encoding or size");
  const transaction = getTransactionDecoder().decode(bytes);
  const message = getCompiledTransactionMessageDecoder().decode(
    transaction.messageBytes,
  );
  if (message.version !== "legacy" && message.version !== 0)
    throw new IntegrationBlocked(
      "Collector Crypt",
      "Unsupported transaction message version",
    );
  if ("addressTableLookups" in message && message.addressTableLookups?.length)
    throw new IntegrationBlocked(
      "Collector Crypt",
      "Address lookup tables require resolved account inspection before use",
    );
  const requiredSigners = Object.keys(transaction.signatures);
  if (
    !requiredSigners.includes(buyer) ||
    !message.staticAccounts.includes(address(card.mint))
  )
    throw new Error(
      "Transaction does not reference the expected buyer and asset",
    );
  const feePayer = message.staticAccounts[0];
  if (feePayer !== buyer || requiredSigners.length !== 1)
    throw new IntegrationBlocked(
      "Collector Crypt",
      "Provider fee sponsorship or additional signers are disabled; fund the buyer with devnet SOL and rebuild",
    );
  if (
    Object.values(transaction.signatures).some(
      (value) => value !== null && value.some((byte) => byte !== 0),
    )
  )
    throw new Error("Unexpected signature on purchase draft");
  const programs = message.instructions.map(
    (instruction) => message.staticAccounts[instruction.programAddressIndex],
  );
  if (
    !programs.includes(address(marketplaceProgram)) ||
    programs.some(
      (program) =>
        program !== marketplaceProgram && program !== computeBudgetProgram,
    )
  )
    throw new IntegrationBlocked(
      "Collector Crypt",
      "Unexpected top-level transaction program; instruction inspection is required",
    );
  return {
    unsignedBase64,
    network: "devnet",
    inspection: "required",
    review: {
      buyer,
      mint: card.mint,
      seller: market.owner.wallet,
      price: card.ask,
      feePayer,
      requiredSigners,
      programs: [...new Set(programs)] as string[],
      checkedAt: new Date().toISOString(),
    },
  };
}
