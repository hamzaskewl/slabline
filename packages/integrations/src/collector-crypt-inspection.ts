import { createPublicKey, verify } from "node:crypto";
import {
  address,
  getAddressEncoder,
  getAddressDecoder,
  getProgramDerivedAddress,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  getBase64EncodedWireTransaction,
  type Base64EncodedBytes,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  compileTransaction,
  AccountRole,
  type Blockhash,
} from "@solana/kit";
import { units, IntegrationBlocked, type Listing } from "@collectible/domain";
import { solanaRpc } from "./solana";

// Protocol facts read from the program-owned devnet Anchor IDL at
// BaG7ceddQ1UAg4QzrzX1c6MKKKH8wwHwRnKPkbF8TRqp (2026-11-16 Chicago).
// https://docs.collectorcrypt.com/marketplace/program
export const CC_PROGRAM = "CcmRKTuZCGJBWQwMHvDYApBRvSZNHqGJXkznqpDTSQUr";
export const CC_DEVNET_USDC = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";
export const CORE_PROGRAM = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM = "11111111111111111111111111111111";
const COMPUTE = "ComputeBudget111111111111111111111111111111";
const BUY_CORE = Buffer.from([169, 227, 87, 255, 76, 86, 255, 25]);
const encoder = getAddressEncoder(),
  decoder = getAddressDecoder();
type Account = { owner: string; data: Uint8Array };
const pubkey = (data: Uint8Array, offset: number) =>
  decoder.decode(data.subarray(offset, offset + 32));
function owned(
  a: Account,
  program: string,
  discriminator: number[],
  min: number,
) {
  if (
    a.owner !== program ||
    a.data.length < min ||
    !Buffer.from(a.data.subarray(0, 8)).equals(Buffer.from(discriminator))
  )
    throw new Error("Unexpected marketplace account layout");
  return Buffer.from(a.data);
}
export function decodeCcMarket(a: Account) {
  const d = owned(a, CC_PROGRAM, [219, 190, 213, 55, 0, 227, 198, 154], 187);
  if (
    d.readUInt32LE(8) !== 5 ||
    d[151] !== 0 ||
    d.readUInt16LE(141) > 200 ||
    pubkey(d, 154) !== CC_DEVNET_USDC
  )
    throw new Error("Unsupported or paused devnet marketplace");
  return {
    treasury: pubkey(d, 109),
    usdcMint: pubkey(d, 154),
    feeBps: d.readUInt16LE(141),
  };
}
export function decodeCcListing(a: Account) {
  const d = owned(a, CC_PROGRAM, [218, 32, 50, 73, 43, 134, 26, 58], 162);
  if (d[113] !== 3)
    throw new Error(
      "Only verified Core listings are supported in devnet tests",
    );
  return {
    seller: pubkey(d, 8),
    mint: pubkey(d, 40),
    collection: pubkey(d, 72),
    price: d.readBigUInt64LE(105),
    rentReceiver: pubkey(d, 130),
  };
}
export function decodeCoreOwner(a: Account) {
  // Metaplex Core AssetV1: Key(1), owner(pubkey), UpdateAuthority::Collection(2, pubkey).
  if (
    a.owner !== CORE_PROGRAM ||
    a.data.length < 66 ||
    a.data[0] !== 1 ||
    a.data[33] !== 2
  )
    throw new Error("Unsupported Core asset");
  return { owner: pubkey(a.data, 1), collection: pubkey(a.data, 34) };
}
export async function ccPda(
  seeds: (string | ArrayLike<number>)[],
  program = CC_PROGRAM,
) {
  return (
    await getProgramDerivedAddress({
      programAddress: address(program),
      seeds: seeds.map((s) =>
        typeof s === "string" ? Buffer.from(s) : Buffer.from(s),
      ),
    })
  )[0];
}
export async function ccAta(wallet: string, mint = CC_DEVNET_USDC) {
  return ccPda(
    [
      encoder.encode(address(wallet)),
      encoder.encode(address(TOKEN_PROGRAM)),
      encoder.encode(address(mint)),
    ],
    ATA_PROGRAM,
  );
}
export type CcContext = {
  buyer: string;
  seller: string;
  mint: string;
  collection: string;
  price: string;
  treasury: string;
  feeBps: number;
  rentReceiver: string;
  marketAddress: string;
  listingAddress: string;
  whitelistAddress: string;
  buyerAta: string;
  sellerAta: string;
  treasuryAta: string;
  slot: string;
};
const unpack = (
  a: { owner: string; data: readonly [string, string] } | null,
): Account => {
  if (!a) throw new Error("Required onchain account is missing");
  return { owner: a.owner, data: Buffer.from(a.data[0], "base64") };
};
export async function ccPurchaseContext(
  card: Listing,
  buyer: string,
): Promise<CcContext> {
  if (card.network !== "devnet" || !card.seller)
    throw new IntegrationBlocked(
      "Collector Crypt",
      "Only devnet tests with a verified seller are supported",
    );
  address(buyer);
  address(card.seller);
  address(card.mint);
  const marketAddress = await ccPda(["market"]),
    listingAddress = await ccPda([
      "listing",
      encoder.encode(address(card.mint)),
      encoder.encode(address(card.seller)),
    ]);
  const rpc = solanaRpc("devnet"),
    first = await rpc
      .getMultipleAccounts(
        [address(marketAddress), address(listingAddress), address(card.mint)],
        { encoding: "base64", commitment: "confirmed" },
      )
      .send({ abortSignal: AbortSignal.timeout(15000) });
  const market = decodeCcMarket(unpack(first.value[0]!)),
    listing = decodeCcListing(unpack(first.value[1]!)),
    asset = decodeCoreOwner(unpack(first.value[2]!));
  if (
    listing.seller !== card.seller ||
    listing.mint !== card.mint ||
    listing.price !== units(card.ask) ||
    asset.owner !== card.seller ||
    asset.collection !== listing.collection ||
    buyer === card.seller
  )
    throw new Error("Onchain listing changed; refresh before continuing");
  const whitelistAddress = await ccPda([
    "whitelist_entry",
    encoder.encode(address(marketAddress)),
    "CoreNFT",
    encoder.encode(address(listing.collection)),
  ]);
  const extra = await rpc
    .getMultipleAccounts(
      [
        address(whitelistAddress),
        address(market.usdcMint),
        address(listing.collection),
      ],
      {
        encoding: "base64",
        commitment: "confirmed",
        minContextSlot: first.context.slot,
      },
    )
    .send({ abortSignal: AbortSignal.timeout(15000) });
  const whitelist = owned(
      unpack(extra.value[0]!),
      CC_PROGRAM,
      [141, 86, 175, 114, 237, 146, 82, 151],
      50,
    ),
    mint = unpack(extra.value[1]!);
  if (
    pubkey(whitelist, 8) !== listing.collection ||
    whitelist[40] !== 3 ||
    mint.owner !== TOKEN_PROGRAM ||
    mint.data.length !== 82 ||
    mint.data[44] !== 6 ||
    mint.data[45] !== 1 ||
    unpack(extra.value[2]!).owner !== CORE_PROGRAM
  )
    throw new Error("Collection or payment mint is not verified");
  return {
    buyer,
    seller: card.seller,
    mint: card.mint,
    collection: listing.collection,
    price: card.ask,
    treasury: market.treasury,
    feeBps: market.feeBps,
    rentReceiver: listing.rentReceiver,
    marketAddress,
    listingAddress,
    whitelistAddress,
    buyerAta: await ccAta(buyer),
    sellerAta: await ccAta(card.seller),
    treasuryAta: await ccAta(market.treasury),
    slot: extra.context.slot.toString(),
  };
}
export function inspectCcTransaction(
  encoded: string,
  context: CcContext,
  signed = false,
) {
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > 1232 || bytes.toString("base64") !== encoded)
    throw new Error("Invalid Solana transaction encoding");
  const tx = getTransactionDecoder().decode(bytes),
    message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  if (getBase64EncodedWireTransaction(tx) !== encoded)
    throw new Error("Non-canonical transaction encoding");
  if (
    !Buffer.from(getCompiledTransactionMessageEncoder().encode(message)).equals(
      Buffer.from(tx.messageBytes),
    )
  )
    throw new Error("Non-canonical transaction message");
  if (
    (message.version !== "legacy" && message.version !== 0) ||
    ("addressTableLookups" in message && message.addressTableLookups?.length)
  )
    throw new Error("Unresolved transaction accounts are not supported");
  if (
    !("instructions" in message) ||
    message.staticAccounts[0] !== context.buyer ||
    Object.keys(tx.signatures).length !== 1 ||
    !Object.hasOwn(tx.signatures, context.buyer)
  )
    throw new Error("Buyer must be the only signer and fee/rent payer");
  const expected = [
    context.buyer,
    context.seller,
    context.rentReceiver,
    context.buyer,
    context.marketAddress,
    context.whitelistAddress,
    context.mint,
    context.collection,
    context.listingAddress,
    CC_DEVNET_USDC,
    context.buyerAta,
    context.sellerAta,
    context.treasury,
    context.treasuryAta,
    CORE_PROGRAM,
    ATA_PROGRAM,
    TOKEN_PROGRAM,
    SYSTEM,
  ];
  const writable = new Set([
    context.buyer,
    context.seller,
    context.rentReceiver,
    context.mint,
    context.collection,
    context.listingAddress,
    context.buyerAta,
    context.sellerAta,
    context.treasuryAta,
  ]);
  if (
    message.staticAccounts.some(
      (a, i) =>
        ![...expected, CC_PROGRAM, COMPUTE].includes(a) ||
        (i <
          message.header.numSignerAccounts -
            message.header.numReadonlySignerAccounts ||
          (i >= message.header.numSignerAccounts &&
            i <
              message.staticAccounts.length -
                message.header.numReadonlyNonSignerAccounts)) !==
          writable.has(a),
    )
  )
    throw new Error("Unexpected account or write permission");
  let buys = 0,
    cuLimit = 200000,
    cuPrice = 0n;
  const computeSeen = new Set<number>();
  for (const ix of message.instructions) {
    const program = message.staticAccounts[ix.programAddressIndex],
      data = Buffer.from(ix.data ?? []);
    if (program === COMPUTE) {
      if (
        ix.accountIndices?.length ||
        computeSeen.has(data[0]!) ||
        (data[0] !== 2 && data[0] !== 3)
      )
        throw new Error("Unsupported compute budget instruction");
      computeSeen.add(data[0]!);
      if (data[0] === 2 && data.length === 5) cuLimit = data.readUInt32LE(1);
      else if (data[0] === 3 && data.length === 9)
        cuPrice = data.readBigUInt64LE(1);
      else throw new Error("Malformed compute budget");
    } else if (program === CC_PROGRAM) {
      buys++;
      if (
        data.length !== 16 ||
        !data.subarray(0, 8).equals(BUY_CORE) ||
        data.readBigUInt64LE(8) !== units(context.price) ||
        ix.accountIndices?.length !== expected.length ||
        ix.accountIndices.some(
          (index, i) => message.staticAccounts[index] !== expected[i],
        )
      )
        throw new Error(
          "Purchase instruction does not match the exact card, buyer, seller, price and recipients",
        );
    } else throw new Error("Unexpected transaction program");
  }
  if (buys !== 1 || cuLimit < 1 || cuLimit > 400000 || cuPrice > 100000n)
    throw new Error("Purchase count or priority fee exceeds the test limit");
  const sig = tx.signatures[address(context.buyer)];
  if (signed) {
    if (
      !sig ||
      !verify(
        null,
        Buffer.from(tx.messageBytes),
        createPublicKey({
          key: Buffer.concat([
            Buffer.from("302a300506032b6570032100", "hex"),
            Buffer.from(encoder.encode(address(context.buyer))),
          ]),
          format: "der",
          type: "spki",
        }),
        sig,
      )
    )
      throw new Error("Invalid buyer transaction signature");
  } else if (sig && sig.some((b) => b !== 0))
    throw new Error("Unexpected signature on purchase draft");
  return {
    transaction: tx,
    messageHash: Buffer.from(tx.messageBytes).toString("base64"),
    blockhash: message.lifetimeToken,
    priorityFeeLimitLamports: (
      (BigInt(cuLimit) * cuPrice + 999999n) /
      1000000n
    ).toString(),
  };
}
export async function buildDirectCcDevnetDraft(
  context: CcContext,
  testLifetime?: { blockhash: Blockhash; lastValidBlockHeight: bigint },
) {
  const lifetime = testLifetime
    ? { value: testLifetime }
    : await solanaRpc("devnet")
        .getLatestBlockhash({ commitment: "confirmed" })
        .send({ abortSignal: AbortSignal.timeout(15000) });
  const fields = [
    context.buyer,
    context.seller,
    context.rentReceiver,
    context.buyer,
    context.marketAddress,
    context.whitelistAddress,
    context.mint,
    context.collection,
    context.listingAddress,
    CC_DEVNET_USDC,
    context.buyerAta,
    context.sellerAta,
    context.treasury,
    context.treasuryAta,
    CORE_PROGRAM,
    ATA_PROGRAM,
    TOKEN_PROGRAM,
    SYSTEM,
  ];
  const writable = new Set([0, 1, 2, 3, 6, 7, 8, 10, 11, 13]);
  const data = Buffer.alloc(16);
  BUY_CORE.copy(data);
  data.writeBigUInt64LE(units(context.price), 8);
  const limit = Buffer.alloc(5);
  limit[0] = 2;
  limit.writeUInt32LE(400000, 1);
  const priority = Buffer.alloc(9);
  priority[0] = 3;
  priority.writeBigUInt64LE(10000n, 1);
  const message = appendTransactionMessageInstructions(
    [
      { programAddress: address(COMPUTE), data: limit },
      { programAddress: address(COMPUTE), data: priority },
      {
        programAddress: address(CC_PROGRAM),
        accounts: fields.map((value, i) => ({
          address: address(value),
          role:
            i === 0 || i === 3
              ? AccountRole.WRITABLE_SIGNER
              : writable.has(i)
                ? AccountRole.WRITABLE
                : AccountRole.READONLY,
        })),
        data,
      },
    ],
    setTransactionMessageLifetimeUsingBlockhash(
      lifetime.value,
      setTransactionMessageFeePayer(
        address(context.buyer),
        createTransactionMessage({ version: "legacy" }),
      ),
    ),
  );
  const encoded = getBase64EncodedWireTransaction(compileTransaction(message));
  inspectCcTransaction(encoded, context);
  return {
    unsignedBase64: encoded,
    lastValidBlockHeight: lifetime.value.lastValidBlockHeight.toString(),
    source: "collectorcrypt_program" as const,
  };
}
function tokenAmount(a: Account | null, owner: string) {
  if (!a) return 0n;
  if (
    a.owner !== TOKEN_PROGRAM ||
    a.data.length !== 165 ||
    pubkey(a.data, 0) !== CC_DEVNET_USDC ||
    pubkey(a.data, 32) !== owner ||
    a.data[108] !== 1
  )
    throw new Error("Unexpected USDC token account");
  return Buffer.from(a.data).readBigUInt64LE(64);
}
export async function simulateCcPurchase(encoded: string, context: CcContext) {
  const checked = inspectCcTransaction(encoded, context),
    rpc = solanaRpc("devnet");
  const addresses = [
    context.buyer,
    context.buyerAta,
    context.sellerAta,
    context.treasuryAta,
    context.mint,
    context.listingAddress,
  ].map(address);
  const before = await rpc
    .getMultipleAccounts(addresses, {
      encoding: "base64",
      commitment: "confirmed",
      minContextSlot: BigInt(context.slot),
    })
    .send({ abortSignal: AbortSignal.timeout(15000) });
  const fee = await rpc
    .getFeeForMessage(checked.messageHash as Base64EncodedBytes, {
      commitment: "confirmed",
    })
    .send({ abortSignal: AbortSignal.timeout(15000) });
  if (fee.value === null)
    throw new Error("Transaction expired; rebuild the draft");
  const simulation = await rpc
    .simulateTransaction(getBase64EncodedWireTransaction(checked.transaction), {
      encoding: "base64",
      commitment: "confirmed",
      sigVerify: false,
      replaceRecentBlockhash: false,
      minContextSlot: before.context.slot,
      accounts: { encoding: "base64", addresses },
    })
    .send({ abortSignal: AbortSignal.timeout(15000) });
  if (simulation.value.err || !simulation.value.accounts)
    throw new Error(
      "Devnet simulation failed. Check test SOL and Collector Crypt test USDC; no transaction was sent",
    );
  const post = simulation.value.accounts,
    asAccount = (a: Parameters<typeof unpack>[0] | undefined) =>
      a ? unpack(a) : null;
  const price = units(context.price),
    platformFee = (price * BigInt(context.feeBps)) / 10000n;
  const solCost = (before.value[0]?.lamports ?? 0n) - (post[0]?.lamports ?? 0n);
  if (
    solCost < fee.value ||
    solCost > 20000000n ||
    !post[0] ||
    post[0].owner !== SYSTEM ||
    tokenAmount(asAccount(before.value[1]), context.buyer) -
      tokenAmount(asAccount(post[1]), context.buyer) !==
      price ||
    tokenAmount(asAccount(post[2]), context.seller) -
      tokenAmount(asAccount(before.value[2]), context.seller) !==
      price - platformFee ||
    tokenAmount(asAccount(post[3]), context.treasury) -
      tokenAmount(asAccount(before.value[3]), context.treasury) !==
      platformFee
  )
    throw new Error(
      "Simulated payment or SOL cost does not match the reviewed purchase",
    );
  const asset = decodeCoreOwner(unpack(post[4]!));
  if (
    asset.owner !== context.buyer ||
    asset.collection !== context.collection ||
    (post[5] && post[5].lamports !== 0n)
  )
    throw new Error("Simulated card delivery or listing closure did not match");
  return {
    source: "solana_simulation" as const,
    network: "devnet" as const,
    slot: simulation.context.slot.toString(),
    feeLamports: fee.value.toString(),
    totalSolCostLamports: solCost.toString(),
    priceBaseUnits: price.toString(),
    platformFeeBaseUnits: platformFee.toString(),
    messageBase64: checked.messageHash,
    observedAt: new Date().toISOString(),
    moneyMoved: false as const,
  };
}
