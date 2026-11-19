import {
  address,
  createNoopSigner,
  isSignerRole,
  isWritableRole,
  type Instruction,
} from "@solana/kit";
import {
  publicKey,
  transactionBuilder,
  type Umi,
} from "@metaplex-foundation/umi";
import {
  getCreateAssociatedTokenIdempotentInstruction,
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { units, money, type DemoCollectible } from "@collectible/domain";
import { solanaRpc, SOLANA_USDC_MINTS } from "./solana";

type Payment = NonNullable<DemoCollectible["payment"]>;
export function rewardPaymentConfig(
  network: "devnet" | "mainnet",
): Payment | null {
  const recipient =
    process.env[
      network === "devnet"
        ? "REWARD_TOPUP_RECIPIENT_DEVNET"
        : "REWARD_TOPUP_RECIPIENT_MAINNET"
    ]?.trim();
  if (!recipient) return null;
  try {
    return {
      network,
      mint: SOLANA_USDC_MINTS[network],
      recipient: address(recipient),
    };
  } catch {
    return null;
  }
}

/** Read spendable native USDC, excluding frozen and foreign token accounts. */
export async function rewardPaymentSources(
  wallet: string,
  amount: string,
  payment: Payment,
) {
  if (payment.recipient === wallet)
    throw new Error("The payment recipient cannot be your own wallet.");
  if (payment.mint !== SOLANA_USDC_MINTS[payment.network])
    throw new Error("Unexpected reward payment token.");
  let remaining = units(amount);
  if (remaining <= 0n) throw new Error("Invalid wallet contribution.");
  const accounts = await solanaRpc(payment.network)
    .getTokenAccountsByOwner(
      address(wallet),
      { mint: address(payment.mint) },
      { encoding: "jsonParsed", commitment: "confirmed" },
    )
    .send({ abortSignal: AbortSignal.timeout(15000) });
  const sources: { address: string; amount: bigint }[] = [];
  for (const account of accounts.value) {
    const data = account.account.data as {
      parsed?: {
        info?: {
          owner?: string;
          mint?: string;
          state?: string;
          tokenAmount?: { amount?: string; decimals?: number };
        };
      };
    };
    const info = data.parsed?.info;
    if (
      account.account.owner !== "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" ||
      info?.owner !== wallet ||
      info.mint !== payment.mint ||
      info.state !== "initialized" ||
      info.tokenAmount?.decimals !== 6 ||
      !/^\d+$/.test(info.tokenAmount.amount ?? "")
    )
      continue;
    const balance = BigInt(info.tokenAmount!.amount!);
    const use = balance < remaining ? balance : remaining;
    if (use > 0n) sources.push({ address: account.pubkey, amount: use });
    remaining -= use;
    if (remaining === 0n) break;
  }
  if (remaining > 0n)
    throw new Error(
      `Add ${money(remaining)} more ${payment.network === "devnet" ? "test " : ""}USDC to your connected wallet, then retry.`,
    );
  if (sources.length > 4)
    throw new Error(
      "Consolidate your USDC into fewer token accounts, then retry.",
    );
  return sources;
}

/** Included in the very same signed transaction as delivery; no separate charge. */
export async function rewardPaymentInstructions(
  umi: Umi,
  wallet: string,
  amount: string,
  payment: Payment,
  sources: { address: string; amount: bigint }[],
) {
  if (
    payment.recipient === wallet ||
    payment.mint !== SOLANA_USDC_MINTS[payment.network] ||
    units(amount) <= 0n ||
    sources.some((s) => s.amount <= 0n) ||
    sources.reduce((sum, s) => sum + s.amount, 0n) !== units(amount)
  )
    throw new Error("Invalid reward payment.");
  const mint = address(payment.mint),
    owner = address(payment.recipient),
    authority = createNoopSigner(address(wallet));
  const [destination] = await findAssociatedTokenPda({
    mint,
    owner,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const instructions: Instruction[] = [
    getCreateAssociatedTokenIdempotentInstruction({
      mint,
      owner,
      payer: authority,
      ata: destination,
    }),
    ...sources.map((source) =>
      getTransferCheckedInstruction({
        source: address(source.address),
        mint,
        destination,
        authority,
        amount: source.amount,
        decimals: 6,
      }),
    ),
  ];
  return transactionBuilder(
    instructions.map((i) => ({
      instruction: {
        programId: publicKey(i.programAddress),
        keys: (i.accounts ?? []).map((a) => ({
          pubkey: publicKey(a.address),
          isSigner: isSignerRole(a.role),
          isWritable: isWritableRole(a.role),
        })),
        data: new Uint8Array(i.data ?? []),
      },
      signers: [umi.identity],
      bytesCreatedOnChain: 0,
    })),
  );
}
