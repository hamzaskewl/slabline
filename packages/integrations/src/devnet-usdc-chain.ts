import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createKeyPairSignerFromPrivateKeyBytes,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signature,
  type KeyPairSigner,
  type Base64EncodedWireTransaction,
  type Instruction,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getBurnCheckedInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  getMintDecoder,
  getMintToCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getAddMemoInstruction } from "@solana-program/memo";
import { money, units } from "@collectible/domain";
import { DemoError, requireDemoNetwork } from "./demo";
import { solanaNetwork, solanaRpc, SOLANA_USDC_MINTS } from "./solana";

export type TransferDraft = {
  mint: string;
  unsignedBase64: string;
  signature: string;
  lastValidBlockHeight: string;
  preparedSlot: string;
};
export type TransferInput = {
  id: string;
  direction: "deposit" | "withdraw";
  amount: string;
  wallet: string;
};
export type TransferOutcome = "pending" | "confirmed" | "failed" | "expired";
export interface UsdcChain {
  configuration(): { configured: boolean; mint: string | null };
  balance(wallet: string): Promise<string>;
  prepare(input: TransferInput): Promise<TransferDraft>;
  outcome(draft: TransferDraft): Promise<TransferOutcome>;
  broadcast(signedBase64: string): Promise<void>;
}
const timeout = () => ({ abortSignal: AbortSignal.timeout(15000) });
export function devnetUsdcConfiguration() {
  requireDemoNetwork(solanaNetwork());
  const mint = process.env.SLABLINE_DEVNET_USDC_MINT || null;
  if (mint) {
    address(mint);
    if (
      (Object.values(SOLANA_USDC_MINTS) as string[]).includes(mint) ||
      mint === "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"
    )
      throw new DemoError(
        "Transfers require the configured platform devnet mint.",
        503,
      );
  }
  return {
    mint,
    configured: !!mint && !!process.env.SLABLINE_DEVNET_USDC_AUTHORITY_SEED,
  };
}
async function authority() {
  const config = devnetUsdcConfiguration();
  if (!config.configured || !config.mint)
    throw new DemoError(
      "USDC transfers are not configured yet. Top up is still available.",
      503,
    );
  const seed = Buffer.from(
    process.env.SLABLINE_DEVNET_USDC_AUTHORITY_SEED!,
    "base64",
  );
  if (seed.length !== 32)
    throw new DemoError("USDC transfer signing is unavailable.", 503);
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  return { mint: address(config.mint), signer };
}

/** Server pays devnet fees, making the transaction ID known before wallet signing.
 * Both directions still require the user's signature. Never accept mainnet funds. */
export async function buildUsdcTransfer(
  input: TransferInput,
  mint: string,
  signer: KeyPairSigner,
  lifetime: {
    blockhash: Parameters<
      typeof setTransactionMessageLifetimeUsingBlockhash
    >[0]["blockhash"];
    lastValidBlockHeight: bigint;
  },
  preparedSlot: bigint,
): Promise<TransferDraft> {
  const owner = createNoopSigner(address(input.wallet));
  if (owner.address === signer.address)
    throw new DemoError("Choose your own wallet.");
  const [ata] = await findAssociatedTokenPda({
    owner: owner.address,
    mint: address(mint),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const instructions: Instruction[] =
    input.direction === "withdraw"
      ? [
          getCreateAssociatedTokenIdempotentInstruction({
            payer: signer,
            ata,
            owner: owner.address,
            mint: address(mint),
          }),
          getMintToCheckedInstruction({
            mint: address(mint),
            token: ata,
            mintAuthority: signer,
            amount: units(input.amount),
            decimals: 6,
          }),
        ]
      : [
          getBurnCheckedInstruction({
            account: ata,
            mint: address(mint),
            authority: owner,
            amount: units(input.amount),
            decimals: 6,
          }),
        ];
  instructions.push(
    getAddMemoInstruction({
      memo: `slabline:devnet:${input.direction}:${input.id}`,
      signers: [owner],
    }),
  );
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const transaction = await partiallySignTransaction(
    [signer.keyPair],
    compileTransaction(message),
  );
  return {
    mint,
    unsignedBase64: getBase64EncodedWireTransaction(transaction),
    signature: getSignatureFromTransaction(transaction),
    lastValidBlockHeight: lifetime.lastValidBlockHeight.toString(),
    preparedSlot: preparedSlot.toString(),
  };
}

export const devnetUsdcChain: UsdcChain = {
  configuration: devnetUsdcConfiguration,
  async balance(wallet) {
    const { mint } = devnetUsdcConfiguration();
    if (!mint)
      throw new DemoError("USDC transfers are not configured yet.", 503);
    const [ata] = await findAssociatedTokenPda({
      owner: address(wallet),
      mint: address(mint),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const account = await solanaRpc("devnet")
      .getAccountInfo(ata, { encoding: "jsonParsed", commitment: "finalized" })
      .send(timeout());
    if (!account.value) return money(0n);
    const parsed = account.value.data as {
      parsed?: {
        info?: {
          mint?: string;
          owner?: string;
          tokenAmount?: { decimals: number; amount: string };
        };
      };
    };
    const info = parsed.parsed?.info;
    if (
      account.value.owner !== TOKEN_PROGRAM_ADDRESS ||
      info?.mint !== mint ||
      info.owner !== wallet ||
      info.tokenAmount?.decimals !== 6
    )
      throw new DemoError("Wallet token account could not be verified.", 503);
    return money(BigInt(info.tokenAmount.amount));
  },
  async prepare(input) {
    const { mint, signer } = await authority();
    const rpc = solanaRpc("devnet");
    const account = (
      await rpc
        .getAccountInfo(mint, { encoding: "base64", commitment: "finalized" })
        .send(timeout())
    ).value;
    if (!account || account.owner !== TOKEN_PROGRAM_ADDRESS)
      throw new DemoError("USDC mint is unavailable on Devnet.", 503);
    const decoded = getMintDecoder().decode(
      Buffer.from(account.data[0], "base64"),
    );
    if (
      !decoded.isInitialized ||
      decoded.decimals !== 6 ||
      decoded.mintAuthority.__option !== "Some" ||
      decoded.mintAuthority.value !== signer.address ||
      decoded.freezeAuthority.__option !== "None"
    )
      throw new DemoError(
        "USDC mint configuration could not be verified.",
        503,
      );
    if (
      input.direction === "deposit" &&
      units(await this.balance(input.wallet)) < units(input.amount)
    )
      throw new DemoError("Your wallet has insufficient USDC on Devnet.", 409);
    const latest = await rpc
      .getLatestBlockhash({ commitment: "finalized" })
      .send(timeout());
    return buildUsdcTransfer(
      input,
      mint,
      signer,
      latest.value,
      latest.context.slot,
    );
  },
  async outcome(draft) {
    // Read expiry BEFORE status; a processed/confirmed result always stays pending.
    const rpc = solanaRpc("devnet");
    const height = await rpc
      .getBlockHeight({ commitment: "finalized" })
      .send(timeout());
    const result = await rpc
      .getSignatureStatuses([signature(draft.signature)], {
        searchTransactionHistory: true,
      })
      .send(timeout());
    const status = result.value[0];
    if (status?.confirmationStatus === "finalized")
      return status.err ? "failed" : "confirmed";
    if (status || height <= BigInt(draft.lastValidBlockHeight))
      return "pending";
    // Refuse to infer absence from a lagging/pruned RPC. Never refund on timeout.
    if (result.context.slot < BigInt(draft.preparedSlot)) return "pending";
    const first = await rpc.getFirstAvailableBlock().send(timeout());
    if (first > BigInt(draft.preparedSlot)) return "pending";
    const tx = await rpc
      .getTransaction(signature(draft.signature), {
        encoding: "json",
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      })
      .send(timeout());
    if (tx) return tx.meta ? (tx.meta.err ? "failed" : "confirmed") : "pending";
    return "expired";
  },
  async broadcast(signedBase64) {
    requireDemoNetwork(solanaNetwork());
    await solanaRpc("devnet")
      .sendTransaction(signedBase64 as Base64EncodedWireTransaction, {
        encoding: "base64",
        skipPreflight: false,
        maxRetries: 2n,
      })
      .send(timeout());
  },
};
