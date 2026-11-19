import {
  create,
  mplCore,
  deserializeAssetV1,
} from "@metaplex-foundation/mpl-core";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  createNoopSigner,
  publicKey,
  signerIdentity,
  lamports,
} from "@metaplex-foundation/umi";
import {
  address,
  getTransactionDecoder,
  getSignatureFromTransaction,
  getAddressEncoder,
  type Base64EncodedWireTransaction,
  signature,
} from "@solana/kit";
import { createPublicKey, verify, timingSafeEqual } from "node:crypto";
import { getDb, orders, walletLinks, eq, and, sql } from "@collectible/db";
import type { DemoCollectible } from "@collectible/domain";
import { solanaRpc } from "./solana";
import { DemoError, collectibleView } from "./demo";
const CORE = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
type MintData = DemoCollectible & {
  attempts?: number;
  lastValidBlockHeight?: string;
  metadataUri?: string;
  signedBase64?: string;
};
async function owned(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, id),
        eq(orders.userId, userId),
        sql`${orders.idempotencyKey} like 'demo:collectible:%'`,
      ),
    );
  if (!row) throw new DemoError("Card not found.", 404);
  return row;
}
export async function requireDemoWallet(userId: string, wallet: string) {
  const [link] = await getDb()
    .select()
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.userId, userId),
        eq(walletLinks.address, wallet),
        eq(walletLinks.network, "devnet"),
      ),
    );
  if (!link)
    throw new DemoError("Verify this Solana wallet in Wallet first.", 403);
}
export async function buildDemoMint(
  wallet: string,
  name: string,
  uri: string,
  lifetime?: { blockhash: string; lastValidBlockHeight: bigint },
) {
  const latest =
    lifetime ??
    (
      await solanaRpc("devnet")
        .getLatestBlockhash({ commitment: "confirmed" })
        .send()
    ).value;
  const umi = createUmi("https://api.devnet.solana.com")
    .use(mplCore())
    .use(signerIdentity(createNoopSigner(publicKey(wallet))));
  const asset = generateSigner(umi);
  const transaction = await create(umi, {
    asset,
    owner: publicKey(wallet),
    name: name.slice(0, 64),
    uri,
  })
    .setBlockhash({
      blockhash: latest.blockhash,
      lastValidBlockHeight: Number(latest.lastValidBlockHeight),
    })
    .buildAndSign(umi);
  return {
    mint: String(asset.publicKey),
    unsignedBase64: Buffer.from(
      umi.transactions.serialize(transaction),
    ).toString("base64"),
    lastValidBlockHeight: latest.lastValidBlockHeight.toString(),
    metadataUri: uri,
  };
}
export function inspectDemoMintSignature(
  expected: string,
  signed: string,
  wallet: string,
) {
  const decoder = getTransactionDecoder();
  const original = decoder.decode(Buffer.from(expected, "base64"));
  const transaction = decoder.decode(Buffer.from(signed, "base64"));
  const a = Buffer.from(original.messageBytes),
    b = Buffer.from(transaction.messageBytes);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new DemoError("Wallet changed the reviewed transaction.");
  if (!transaction.signatures[address(wallet)])
    throw new DemoError("Wallet signature is missing.");
  for (const [signer, sig] of Object.entries(transaction.signatures)) {
    const key = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(getAddressEncoder().encode(address(signer))),
    ]);
    if (
      !sig ||
      !verify(
        null,
        b,
        createPublicKey({ key, format: "der", type: "spki" }),
        sig,
      )
    )
      throw new DemoError("Invalid transaction signature.");
  }
  return getSignatureFromTransaction(transaction);
}
export async function prepareDemoMint(userId: string, id: string) {
  const row = await owned(userId, id),
    d = row.data as MintData;
  await requireDemoWallet(userId, d.wallet);
  if (row.state === "prepared" && d.lastValidBlockHeight) {
    const height = await solanaRpc("devnet")
      .getBlockHeight({ commitment: "confirmed" })
      .send();
    if (height > BigInt(d.lastValidBlockHeight))
      throw new DemoError(
        "Transaction expired. Cancel for a refund, then collect again.",
        409,
      );
  }
  if (row.state !== "reserved") return collectibleView(row);
  const uri = `${process.env.APP_URL ?? "http://localhost:3000"}/api/demo/metadata/${row.id}`;
  const prepared = await buildDemoMint(d.wallet, d.name, uri);
  const [updated] = await getDb()
    .update(orders)
    .set({ state: "prepared", data: { ...d, ...prepared } })
    .where(and(eq(orders.id, id), eq(orders.state, "reserved")))
    .returning();
  return collectibleView(updated ?? (await owned(userId, id)));
}
export async function submitDemoMint(
  userId: string,
  id: string,
  signedBase64: string,
) {
  const row = await owned(userId, id),
    d = row.data as MintData;
  await requireDemoWallet(userId, d.wallet);
  if (row.state !== "prepared") return checkDemoMint(userId, id);
  if (!d.unsignedBase64) throw new DemoError("Prepare this card first.", 409);
  const sig = inspectDemoMintSignature(
    d.unsignedBase64,
    signedBase64,
    d.wallet,
  );
  const [claimed] = await getDb()
    .update(orders)
    .set({
      state: "submitted",
      data: { ...d, signedBase64, signature: sig, attempts: 1 },
    })
    .where(and(eq(orders.id, id), eq(orders.state, "prepared")))
    .returning();
  if (claimed) {
    try {
      await solanaRpc("devnet")
        .sendTransaction(signedBase64 as Base64EncodedWireTransaction, {
          encoding: "base64",
          skipPreflight: false,
          maxRetries: 2n,
        })
        .send({ abortSignal: AbortSignal.timeout(15000) });
    } catch {
      /* Persisted signature is the recovery handle; never mint another asset. */
    }
  }
  return checkDemoMint(userId, id);
}
export async function checkDemoMint(userId: string, id: string) {
  const row = await owned(userId, id),
    d = row.data as MintData;
  if (row.state === "confirmed" || !d.mint) return collectibleView(row);
  const rpc = solanaRpc("devnet");
  if (d.signature) {
    const status = (
      await rpc
        .getSignatureStatuses([signature(d.signature)], {
          searchTransactionHistory: true,
        })
        .send()
    ).value[0];
    if (status?.err) {
      // A failed transaction cannot create an asset. Keep the debit until an
      // explicit refund, and retain the signature for audit/recovery.
      await getDb()
        .update(orders)
        .set({ state: "failed" })
        .where(and(eq(orders.id, id), eq(orders.state, "submitted")));
      return collectibleView(await owned(userId, id));
    }
  }
  const account = (
    await rpc
      .getAccountInfo(address(d.mint), {
        commitment: "finalized",
        encoding: "base64",
      })
      .send()
  ).value;
  if (account) {
    if (account.owner !== CORE)
      throw new DemoError("Unexpected asset program.", 409);
    const asset = deserializeAssetV1({
      publicKey: publicKey(d.mint),
      owner: publicKey(account.owner),
      lamports: lamports(account.lamports),
      executable: account.executable,
      data: Buffer.from(account.data[0], "base64"),
    });
    if (asset.owner !== d.wallet || asset.uri !== d.metadataUri)
      throw new DemoError("Asset ownership or metadata does not match.", 409);
    await getDb()
      .update(orders)
      .set({ state: "confirmed" })
      .where(
        and(
          eq(orders.id, id),
          sql`${orders.state} in ('prepared','submitted')`,
        ),
      );
  }
  return collectibleView(await owned(userId, id));
}
export async function retryDemoMint(userId: string, id: string) {
  const row = await owned(userId, id),
    d = row.data as MintData;
  await requireDemoWallet(userId, d.wallet);
  if (
    row.state !== "submitted" ||
    !d.signedBase64 ||
    !d.signature ||
    !d.lastValidBlockHeight
  )
    return checkDemoMint(userId, id);
  if ((d.attempts ?? 1) >= 3)
    throw new DemoError(
      "Check this transfer before retrying or refunding.",
      409,
    );
  const rpc = solanaRpc("devnet");
  if (
    (await rpc.getBlockHeight({ commitment: "confirmed" }).send()) >
    BigInt(d.lastValidBlockHeight)
  )
    throw new DemoError(
      "Transaction expired. Check the transfer, then cancel for a refund.",
      409,
    );
  inspectDemoMintSignature(d.unsignedBase64!, d.signedBase64, d.wallet);
  const [claimed] = await getDb()
    .update(orders)
    .set({ data: { ...d, attempts: (d.attempts ?? 1) + 1 } })
    .where(
      and(
        eq(orders.id, id),
        eq(orders.state, "submitted"),
        sql`coalesce((${orders.data}->>'attempts')::int,1) = ${d.attempts ?? 1}`,
      ),
    )
    .returning();
  if (claimed) {
    try {
      await rpc
        .sendTransaction(d.signedBase64 as Base64EncodedWireTransaction, {
          encoding: "base64",
          skipPreflight: false,
          maxRetries: 2n,
        })
        .send({ abortSignal: AbortSignal.timeout(15000) });
    } catch {
      /* Retain the same signature for checking. */
    }
  }
  return checkDemoMint(userId, id);
}
export async function expireDemoMint(userId: string, id: string) {
  const row = await owned(userId, id),
    d = row.data as MintData;
  if (row.state === "reserved") return;
  if (
    !["prepared", "submitted", "failed"].includes(row.state) ||
    !d.mint ||
    !d.lastValidBlockHeight
  )
    throw new DemoError("This card cannot be refunded.", 409);
  const rpc = solanaRpc("devnet");
  const [height, account] = await Promise.all([
    rpc.getBlockHeight({ commitment: "finalized" }).send(),
    rpc
      .getAccountInfo(address(d.mint), {
        encoding: "base64",
        commitment: "finalized",
      })
      .send(),
  ]);
  if (height <= BigInt(d.lastValidBlockHeight) || account.value)
    throw new DemoError(
      "Wait for transaction expiry or check the received asset.",
      409,
    );
  await getDb()
    .update(orders)
    .set({ state: "expired" })
    .where(
      and(
        eq(orders.id, id),
        sql`${orders.state} in ('prepared','submitted','failed')`,
      ),
    );
}
export async function demoMetadata(id: string) {
  const [row] = await getDb()
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, id),
        sql`${orders.idempotencyKey} like 'demo:collectible:%'`,
      ),
    );
  if (!row) throw new DemoError("Card not found.", 404);
  const d = row.data as DemoCollectible;
  return {
    name: d.name,
    symbol: "CM",
    description: "Collectible Markets demo collectible",
    image: d.image,
    external_url: d.sourceUrl,
    attributes: [
      { trait_type: "Network", value: "Devnet" },
      { trait_type: "Source", value: d.source },
      { trait_type: "Source asset", value: d.sourceId },
    ],
    properties: {
      category: "image",
      files: d.image ? [{ uri: d.image }] : [],
    },
  };
}
