import { createUmi } from "../packages/integrations/node_modules/@metaplex-foundation/umi-bundle-defaults";
import {
  createSignerFromKeypair,
  signerIdentity,
  publicKey,
} from "../packages/integrations/node_modules/@metaplex-foundation/umi";
import {
  mplTokenMetadata,
  createMetadataAccountV3,
  findMetadataPda,
} from "../packages/integrations/node_modules/@metaplex-foundation/mpl-token-metadata";
import {
  address,
  getTransactionDecoder,
  getSignatureFromTransaction,
  type Base64EncodedWireTransaction,
} from "@solana/kit";
import {
  solanaRpc,
  withSolanaNetwork,
} from "../packages/integrations/src/solana";
if (process.env.SOLANA_NETWORK === "mainnet") throw new Error("Devnet only.");
const seed = process.env.SLABLINE_DEVNET_USDC_AUTHORITY_SEED,
  mint = process.env.SLABLINE_DEVNET_USDC_MINT;
if (!seed || !mint) throw new Error("Load the saved devnet USDC env file.");
await withSolanaNetwork("devnet", async () => {
  const umi = createUmi("https://api.devnet.solana.com").use(
    mplTokenMetadata(),
  );
  const signer = createSignerFromKeypair(
    umi,
    umi.eddsa.createKeypairFromSeed(Buffer.from(seed, "base64")),
  );
  umi.use(signerIdentity(signer));
  const rpc = solanaRpc("devnet", "https://api.devnet.solana.com", false);
  const [metadata] = findMetadataPda(umi, { mint: publicKey(mint) });
  if (
    (
      await rpc
        .getAccountInfo(address(metadata), {
          encoding: "base64",
          commitment: "finalized",
        })
        .send()
    ).value
  ) {
    console.log(JSON.stringify({ state: "metadata_exists", mint, metadata }));
    return;
  }
  const latest = (
    await rpc.getLatestBlockhash({ commitment: "finalized" }).send()
  ).value;
  const tx = await createMetadataAccountV3(umi, {
    mint: publicKey(mint),
    mintAuthority: signer,
    payer: signer,
    updateAuthority: signer,
    data: {
      name: "Slabline USDC",
      symbol: "USDC",
      uri: "https://slabline.xyz/tokens/devnet-usdc.json",
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    },
    isMutable: false,
    collectionDetails: null,
  })
    .setBlockhash({
      blockhash: latest.blockhash,
      lastValidBlockHeight: Number(latest.lastValidBlockHeight),
    })
    .buildAndSign(umi);
  const bytes = umi.transactions.serialize(tx),
    sig = getSignatureFromTransaction(getTransactionDecoder().decode(bytes));
  await rpc
    .sendTransaction(
      Buffer.from(bytes).toString("base64") as Base64EncodedWireTransaction,
      { encoding: "base64", skipPreflight: false },
    )
    .send();
  for (let i = 0; i < 45; i++) {
    const status = (
      await rpc
        .getSignatureStatuses([sig], { searchTransactionHistory: true })
        .send()
    ).value[0];
    if (status?.err) throw new Error("Metadata transaction failed.");
    if (status?.confirmationStatus === "finalized") {
      console.log(
        JSON.stringify({ state: "finalized", mint, metadata, signature: sig }),
      );
      return;
    }
    await Bun.sleep(2000);
  }
  throw new Error(`Metadata pending: ${sig}`);
});
