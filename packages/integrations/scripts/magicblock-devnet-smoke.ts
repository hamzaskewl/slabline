import {
  addSignersToTransactionMessage,
  appendTransactionMessageInstruction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { randomBytes } from "node:crypto";
import { createMagicBlockDevnetRandomness } from "../src/magicblock-randomness";
import { SOLANA_GENESIS } from "../src/solana";

const programId = process.env.PULL_MAGICBLOCK_PROGRAM_ID;
if (!programId)
  throw new Error(
    "Set PULL_MAGICBLOCK_PROGRAM_ID to the deployed devnet pull receipt program",
  );
const endpoint = "https://api.devnet.solana.com";
const rpc = createSolanaRpc(endpoint);
const timeout = () => ({ abortSignal: AbortSignal.timeout(15000) });
if ((await rpc.getGenesisHash().send(timeout())) !== SOLANA_GENESIS.devnet) {
  throw new Error("MagicBlock smoke test requires Solana devnet");
}

const keypairPath = process.env.PULL_SMOKE_DEVNET_KEYPAIR;
let wallet = await generateKeyPairSigner();
if (keypairPath) {
  const keypair = await Bun.file(keypairPath).json();
  if (
    !Array.isArray(keypair) ||
    keypair.length !== 64 ||
    !keypair.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    throw new Error("Expected a Solana CLI keypair JSON array");
  }
  wallet = await createKeyPairSignerFromBytes(Uint8Array.from(keypair));
}

const adapter = createMagicBlockDevnetRandomness({
  programId,
  rpcUrl: endpoint,
});
const seedHex = randomBytes(32).toString("hex");
const payer = wallet.address;
const { instruction, requestAddress } = await adapter.prepare({
  seedHex,
  payer,
});

if (!keypairPath) {
  const airdrop = await rpc
    .requestAirdrop(payer, lamports(10_000_000n), { commitment: "confirmed" })
    .send(timeout());
  let funded = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const {
      value: [status],
    } = await rpc.getSignatureStatuses([airdrop]).send(timeout());
    if (status?.err) throw new Error("Devnet faucet transaction failed");
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      funded = true;
      break;
    }
    await Bun.sleep(1500);
  }
  if (!funded) throw new Error("Devnet faucet confirmation timed out");
}

const { value: lifetime } = await rpc
  .getLatestBlockhash({ commitment: "confirmed" })
  .send(timeout());
const message = addSignersToTransactionMessage(
  [wallet],
  appendTransactionMessageInstruction(
    instruction,
    setTransactionMessageLifetimeUsingBlockhash(
      lifetime,
      setTransactionMessageFeePayer(
        payer,
        createTransactionMessage({ version: "legacy" }),
      ),
    ),
  ),
);
const signed = await signTransactionMessageWithSigners(message);
const requestSignature = getSignatureFromTransaction(signed);
console.log(
  JSON.stringify({ payer, seedHex, requestAddress, requestSignature }),
);

await rpc
  .sendTransaction(getBase64EncodedWireTransaction(signed), {
    encoding: "base64",
    preflightCommitment: "confirmed",
    maxRetries: 2n,
  })
  .send(timeout());

for (let attempt = 0; attempt < 40; attempt++) {
  const proof = await adapter.verify({ payer, seedHex, requestSignature });
  if (proof.status === "fulfilled") {
    console.log(JSON.stringify(proof));
    process.exit(0);
  }
  await Bun.sleep(2500);
}
throw new Error(
  "MagicBlock fulfillment timed out. Check the logged request on devnet.",
);
