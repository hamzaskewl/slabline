import { createSolanaRpc, address, signature } from "@solana/kit";
import { IntegrationBlocked } from "@collectible/domain";
export function solanaNetwork() {
  return process.env.SOLANA_NETWORK === "mainnet" ? "mainnet" : "devnet";
}
function rpc() {
  return createSolanaRpc(
    process.env.QUICKNODE_RPC_URL ??
      process.env.SOLANA_RPC_URL ??
      (solanaNetwork() === "devnet"
        ? "https://api.devnet.solana.com"
        : "https://api.mainnet-beta.solana.com"),
  );
}
const timeout = () => ({ abortSignal: AbortSignal.timeout(15000) });
export async function getSolanaBalances(wallet: string) {
  const balance = await rpc()
    .getBalance(address(wallet), { commitment: "confirmed" })
    .send(timeout());
  const mint = process.env.SOLANA_USDC_MINT;
  let usdc: string | null = null;
  if (mint) {
    const tokens = await rpc()
      .getTokenAccountsByOwner(
        address(wallet),
        { mint: address(mint) },
        { encoding: "jsonParsed", commitment: "confirmed" },
      )
      .send(timeout());
    let total = 0n;
    for (const t of tokens.value) {
      const data = t.account.data as {
        parsed?: {
          info?: { tokenAmount?: { amount?: string; decimals?: number } };
        };
      };
      const amount = data.parsed?.info?.tokenAmount;
      if (amount?.decimals !== 6 || !amount.amount)
        throw new Error("Unexpected USDC account format");
      total += BigInt(amount.amount);
    }
    usdc = `${total / 1000000n}.${(total % 1000000n).toString().padStart(6, "0")}`;
  }
  return {
    wallet,
    network: solanaNetwork(),
    solLamports: balance.value.toString(),
    usdc,
    usdcMint: mint ?? null,
    observedAt: new Date().toISOString(),
  };
}
export async function confirmSolanaTransaction(transactionSignature: string) {
  const result = await rpc()
    .getSignatureStatuses([signature(transactionSignature)], {
      searchTransactionHistory: true,
    })
    .send(timeout());
  const status = result.value[0];
  return {
    signature: transactionSignature,
    network: solanaNetwork(),
    state: !status
      ? "not_found"
      : status.err
        ? "failed"
        : status.confirmationStatus === "finalized"
          ? "finalized"
          : status.confirmationStatus === "confirmed"
            ? "confirmed"
            : "pending",
    slot: status?.slot.toString() ?? null,
    confirmed:
      !!status &&
      !status.err &&
      ["confirmed", "finalized"].includes(status.confirmationStatus ?? ""),
    error: status?.err ? JSON.stringify(status.err) : null,
  };
}
export async function reconcileAssetOwner(mint: string, expectedOwner: string) {
  const endpoint = process.env.QUICKNODE_DAS_RPC_URL;
  if (!endpoint)
    throw new IntegrationBlocked(
      "Solana ownership",
      "DAS RPC required for uniform compressed, Core and standard asset ownership checks",
    );
  address(mint);
  address(expectedOwner);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAsset",
      params: { id: mint },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("DAS owner lookup unavailable");
  const body = (await response.json()) as {
    result?: { id?: string; burnt?: boolean; ownership?: { owner?: string } };
    error?: unknown;
  };
  if (body.error || body.result?.id !== mint)
    throw new Error("Asset ownership could not be reconciled");
  return {
    mint,
    owner: body.result.ownership?.owner ?? null,
    verified:
      !body.result.burnt && body.result.ownership?.owner === expectedOwner,
    observedAt: new Date().toISOString(),
  };
}
