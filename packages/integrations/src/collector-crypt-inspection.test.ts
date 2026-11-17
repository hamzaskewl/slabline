import { expect, test } from "bun:test";
import {
  generateKeyPairSigner,
  address,
  blockhash,
  getAddressEncoder,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  getBase64EncodedWireTransaction,
  signTransaction,
  type TransactionMessageBytes,
} from "@solana/kit";
import {
  ccPda,
  ccAta,
  buildDirectCcDevnetDraft,
  inspectCcTransaction,
  decodeCcMarket,
  decodeCcListing,
  decodeCoreOwner,
  CC_PROGRAM,
  CC_DEVNET_USDC,
  CORE_PROGRAM,
  type CcContext,
} from "./collector-crypt-inspection";

import { simulatedCcContext } from "./collector-crypt-fixtures";

const lifetime = {
  blockhash: blockhash("11111111111111111111111111111111"),
  lastValidBlockHeight: 1n,
};
test("Collector Crypt user-funded draft pins price, all accounts and fee payer using the devnet ABI", async () => {
  const { context } = await simulatedCcContext(),
    draft = await buildDirectCcDevnetDraft(context, lifetime),
    result = inspectCcTransaction(draft.unsignedBase64, context);
  expect(Object.keys(result.transaction.signatures)).toEqual([context.buyer]);
  expect(result.priorityFeeLimitLamports).toBe("4000");
  expect(draft.source).toBe("collectorcrypt_program");
});
test("Collector Crypt instruction inspection rejects payment, asset, permission and compute-budget tampering", async () => {
  const { context } = await simulatedCcContext(),
    draft = await buildDirectCcDevnetDraft(context, lifetime),
    tx = getTransactionDecoder().decode(
      Buffer.from(draft.unsignedBase64, "base64"),
    ),
    message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  if (message.version !== "legacy") throw new Error("Fixture version");
  const encode = (msg: typeof message) =>
    getBase64EncodedWireTransaction({
      ...tx,
      messageBytes: getCompiledTransactionMessageEncoder().encode(
        msg,
      ) as TransactionMessageBytes,
    });
  const buyIndex = message.instructions.findIndex(
    (i) => message.staticAccounts[i.programAddressIndex] === CC_PROGRAM,
  );
  const changeBuy = (mutate: (data: Buffer) => void) => {
    const data = Buffer.from(message.instructions[buyIndex]!.data!);
    mutate(data);
    return {
      ...message,
      instructions: message.instructions.map((i, index) =>
        index === buyIndex ? { ...i, data } : i,
      ),
    };
  };
  const cases = [
    changeBuy((d) => d.writeBigUInt64LE(27000000n, 8)),
    changeBuy((d) => {
      d[0] = 0;
    }),
    {
      ...message,
      staticAccounts: message.staticAccounts.map((a) =>
        a === context.seller ? address(context.treasury) : a,
      ),
    },
    {
      ...message,
      staticAccounts: message.staticAccounts.map((a) =>
        a === context.treasuryAta ? address(context.buyerAta) : a,
      ),
    },
    {
      ...message,
      instructions: [...message.instructions, message.instructions[buyIndex]!],
    },
    {
      ...message,
      header: {
        ...message.header,
        numReadonlyNonSignerAccounts:
          message.header.numReadonlyNonSignerAccounts - 1,
      },
    },
    {
      ...message,
      instructions: [
        ...message.instructions,
        {
          programAddressIndex: message.staticAccounts.indexOf(
            address("11111111111111111111111111111111"),
          ),
          accountIndices: [0],
          data: new Uint8Array([2, 0, 0, 0]),
        },
      ],
    },
  ];
  for (const candidate of cases)
    expect(() => inspectCcTransaction(encode(candidate), context)).toThrow();
  const priority = message.instructions.findIndex((i) => i.data?.[0] === 3),
    high = Buffer.alloc(9);
  high[0] = 3;
  high.writeBigUInt64LE(100001n, 1);
  expect(() =>
    inspectCcTransaction(
      encode({
        ...message,
        instructions: message.instructions.map((i, index) =>
          index === priority ? { ...i, data: high } : i,
        ),
      }),
      context,
    ),
  ).toThrow("priority fee");
  expect(() =>
    inspectCcTransaction(
      Buffer.concat([
        Buffer.from(draft.unsignedBase64, "base64"),
        Buffer.from([0]),
      ]).toString("base64"),
      context,
    ),
  ).toThrow();
});
test("Collector Crypt checks the actual buyer signature and never accepts a signed draft as unsigned", async () => {
  const { context, signer } = await simulatedCcContext(),
    draft = await buildDirectCcDevnetDraft(context, lifetime),
    tx = getTransactionDecoder().decode(
      Buffer.from(draft.unsignedBase64, "base64"),
    );
  const signed = await signTransaction([signer.keyPair], tx),
    wire = getBase64EncodedWireTransaction(signed);
  expect(() => inspectCcTransaction(wire, context, true)).not.toThrow();
  expect(() => inspectCcTransaction(wire, context)).toThrow(
    "Unexpected signature",
  );
  const bad = Buffer.from(wire, "base64");
  bad[1] = bad[1]! ^ 1;
  expect(() =>
    inspectCcTransaction(bad.toString("base64"), context, true),
  ).toThrow("Invalid buyer");
});
test("Collector Crypt account decoding binds program ownership, Core collection, mint, price and pause state", async () => {
  const { context } = await simulatedCcContext(),
    enc = getAddressEncoder();
  const market = Buffer.alloc(192);
  Buffer.from([219, 190, 213, 55, 0, 227, 198, 154]).copy(market);
  market.writeUInt32LE(5, 8);
  Buffer.from(enc.encode(address(context.treasury))).copy(market, 109);
  market.writeUInt16LE(200, 141);
  Buffer.from(enc.encode(address(CC_DEVNET_USDC))).copy(market, 154);
  expect(decodeCcMarket({ owner: CC_PROGRAM, data: market }).feeBps).toBe(200);
  expect(() => decodeCcMarket({ owner: CORE_PROGRAM, data: market })).toThrow();
  market[151] = 1;
  expect(() => decodeCcMarket({ owner: CC_PROGRAM, data: market })).toThrow(
    "paused",
  );
  const listing = Buffer.alloc(162);
  Buffer.from([218, 32, 50, 73, 43, 134, 26, 58]).copy(listing);
  Buffer.from(enc.encode(address(context.seller))).copy(listing, 8);
  Buffer.from(enc.encode(address(context.mint))).copy(listing, 40);
  Buffer.from(enc.encode(address(context.collection))).copy(listing, 72);
  listing.writeBigUInt64LE(26000000n, 105);
  listing[113] = 3;
  Buffer.from(enc.encode(address(context.rentReceiver))).copy(listing, 130);
  expect(decodeCcListing({ owner: CC_PROGRAM, data: listing }).price).toBe(
    26000000n,
  );
  listing[113] = 0;
  expect(() => decodeCcListing({ owner: CC_PROGRAM, data: listing })).toThrow(
    "Core",
  );
  const asset = Buffer.alloc(66);
  asset[0] = 1;
  Buffer.from(enc.encode(address(context.buyer))).copy(asset, 1);
  asset[33] = 2;
  Buffer.from(enc.encode(address(context.collection))).copy(asset, 34);
  expect(decodeCoreOwner({ owner: CORE_PROGRAM, data: asset })).toEqual({
    owner: address(context.buyer),
    collection: address(context.collection),
  });
  asset[33] = 1;
  expect(() => decodeCoreOwner({ owner: CORE_PROGRAM, data: asset })).toThrow();
});
