/** Creates a devnet-only mint and isolated fee/mint authority. Secrets stay in a gitignored env file.
 * Usage: bun scripts/setup-devnet-usdc.ts <devnet-payer-keypair.json>
 * Reruns reuse the saved mint. No mainnet endpoint or key is accepted as configuration. */
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  compileTransaction,
  partiallySignTransaction,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
} from "@solana/kit";
import {
  getCreateAccountInstruction,
  getTransferSolInstruction,
} from "../packages/integrations/node_modules/@solana-program/system";
import {
  getInitializeMint2Instruction,
  TOKEN_PROGRAM_ADDRESS,
  getMintDecoder,
} from "../packages/integrations/node_modules/@solana-program/token";
import {
  solanaRpc,
  withSolanaNetwork,
} from "../packages/integrations/src/solana";

if (process.env.SOLANA_NETWORK === "mainnet")
  throw new Error("Devnet setup refuses mainnet configuration.");
const payerFile = process.argv[2];
if (!payerFile) throw new Error("Pass a funded devnet payer keypair file.");
const output = resolve(".env.devnet-usdc.local");
let env: NodeJS.Dict<string>;
try {
  env = parseEnv(await readFile(output, "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  env = {
    SLABLINE_DEVNET_USDC_AUTHORITY_SEED: randomBytes(32).toString("base64"),
    SLABLINE_DEVNET_USDC_SETUP_MINT_SEED: randomBytes(32).toString("base64"),
  };
}
const authority = await createKeyPairSignerFromPrivateKeyBytes(
  Buffer.from(env.SLABLINE_DEVNET_USDC_AUTHORITY_SEED!, "base64"),
);
const mint = await createKeyPairSignerFromPrivateKeyBytes(
  Buffer.from(env.SLABLINE_DEVNET_USDC_SETUP_MINT_SEED!, "base64"),
);
if (
  env.SLABLINE_DEVNET_USDC_MINT &&
  env.SLABLINE_DEVNET_USDC_MINT !== mint.address
)
  throw new Error("Saved mint mismatch.");
env.SLABLINE_DEVNET_USDC_MINT = mint.address;
await writeFile(
  output,
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
const payerJson =
  payerFile === "--railway-env"
    ? process.env.PULL_DEVNET_DEPLOYER_KEYPAIR_JSON
    : await readFile(payerFile, "utf8");
if (!payerJson) throw new Error("Devnet payer key is unavailable.");
const payer = await createKeyPairSignerFromBytes(
  Uint8Array.from(JSON.parse(payerJson)),
);
await withSolanaNetwork("devnet", async () => {
  const rpc = solanaRpc("devnet", "https://api.devnet.solana.com", false);
  const existing = (
    await rpc
      .getAccountInfo(mint.address, {
        encoding: "base64",
        commitment: "finalized",
      })
      .send()
  ).value;
  if (existing) {
    const decoded = getMintDecoder().decode(
      Buffer.from(existing.data[0], "base64"),
    );
    if (
      existing.owner !== TOKEN_PROGRAM_ADDRESS ||
      decoded.decimals !== 6 ||
      decoded.mintAuthority.__option !== "Some" ||
      decoded.mintAuthority.value !== authority.address
    )
      throw new Error("Existing mint mismatch.");
    console.log(
      JSON.stringify({
        state: "already_created",
        mint: mint.address,
        authority: authority.address,
        envFile: output,
      }),
    );
    return;
  }
  const balance = (await rpc.getBalance(payer.address).send()).value;
  if (balance < 110000000n)
    throw new Error(
      `Devnet payer ${payer.address} needs 0.11 test SOL. Saved setup can be resumed.`,
    );
  const rent = await rpc.getMinimumBalanceForRentExemption(82n).send();
  const latest = (
    await rpc.getLatestBlockhash({ commitment: "finalized" }).send()
  ).value;
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
    (m) =>
      appendTransactionMessageInstructions(
        [
          getCreateAccountInstruction({
            payer,
            newAccount: mint,
            lamports: rent,
            space: 82n,
            programAddress: TOKEN_PROGRAM_ADDRESS,
          }),
          getInitializeMint2Instruction({
            mint: mint.address,
            decimals: 6,
            mintAuthority: authority.address,
            freezeAuthority: null,
          }),
          getTransferSolInstruction({
            source: payer,
            destination: authority.address,
            amount: lamports(100000000n),
          }),
        ],
        m,
      ),
  );
  const signed = await partiallySignTransaction(
    [payer.keyPair, mint.keyPair],
    compileTransaction(message),
  );
  const signature = getSignatureFromTransaction(signed);
  console.log(
    JSON.stringify({
      state: "submitting",
      mint: mint.address,
      authority: authority.address,
      signature,
      envFile: output,
    }),
  );
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
      skipPreflight: false,
    })
    .send();
  for (let i = 0; i < 45; i++) {
    const status = (
      await rpc
        .getSignatureStatuses([signature], { searchTransactionHistory: true })
        .send()
    ).value[0];
    if (status?.err) throw new Error("Mint creation failed onchain.");
    if (status?.confirmationStatus === "finalized") {
      console.log(
        JSON.stringify({ state: "finalized", mint: mint.address, signature }),
      );
      return;
    }
    await Bun.sleep(2000);
  }
  throw new Error("Mint creation is pending; rerun to inspect the saved mint.");
});
