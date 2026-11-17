import {
  createSolanaRpcFromTransport,
  createDefaultRpcTransport,
  address,
  signature,
  type RpcTransport,
} from "@solana/kit";
import { IntegrationBlocked } from "@collectible/domain";
import {
  isQuickNodeUrl,
  reserveQuickNodeRpc,
  quickNodeFetch,
} from "./quicknode-budget";
export function solanaNetwork() {
  return process.env.SOLANA_NETWORK === "mainnet" ? "mainnet" : "devnet";
}
const rpcCache = new Map<
  string,
  { client: ReturnType<typeof createSolanaRpcFromTransport>; expires: number }
>();
export const SOLANA_GENESIS = {
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  mainnet: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
} as const;
export function solanaRpc(
  network = solanaNetwork(),
  endpoint?: string,
  allowFallback = true,
) {
  if (network !== solanaNetwork())
    throw new Error("Requested Solana network is not active");
  const fallback =
    process.env.SOLANA_RPC_URL ||
    (network === "devnet"
      ? "https://api.devnet.solana.com"
      : "https://api.mainnet-beta.solana.com");
  const url = endpoint || process.env.QUICKNODE_RPC_URL || fallback;
  const key = JSON.stringify([network, url, fallback, allowFallback]);
  const hit = rpcCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.client;
  const primary = createDefaultRpcTransport({ url });
  const publicTransport = createDefaultRpcTransport({ url: fallback });
  const publicClient = createSolanaRpcFromTransport(publicTransport);
  let fallbackActive = false;
  let fallbackVerified = false;
  let fallbackCheck: Promise<void> | undefined;
  const fallbackSend: RpcTransport = async (request) => {
    if (!allowFallback || isQuickNodeUrl(fallback))
      throw new Error("Public Solana RPC fallback is unavailable");
    if (!fallbackVerified) {
      fallbackCheck ??= publicClient
        .getGenesisHash()
        .send({ abortSignal: AbortSignal.timeout(15000) })
        .then((hash) => {
          if (hash !== SOLANA_GENESIS[network])
            throw new Error("Public Solana RPC network mismatch");
          fallbackVerified = true;
        })
        .finally(() => {
          fallbackCheck = undefined;
        });
      await fallbackCheck;
    }
    return publicTransport(request);
  };
  const send: RpcTransport = async (request) => {
    if (fallbackActive) return fallbackSend(request);
    if (isQuickNodeUrl(url)) {
      try {
        await reserveQuickNodeRpc(request.payload);
      } catch {
        fallbackActive = true;
        return fallbackSend(request);
      }
    }
    try {
      return await primary(request);
    } catch {
      if (!allowFallback) throw new Error("Solana RPC request failed");
      // Stay on the independently checked fallback for this client. A new
      // cached client retries the primary after a minute and checks it afresh.
      fallbackActive = true;
      return fallbackSend(request);
    }
  };
  let checkedAt = 0;
  let checking: Promise<void> | undefined;
  const transport: RpcTransport = async (request) => {
    if (
      (request.payload as { method?: string }).method !== "getGenesisHash" &&
      Date.now() - checkedAt > 60000
    ) {
      checking ??= client
        .getGenesisHash()
        .send({ abortSignal: AbortSignal.timeout(15000) })
        .then((hash) => {
          if (hash !== SOLANA_GENESIS[network])
            throw new Error("Solana RPC network mismatch");
          checkedAt = Date.now();
        })
        .finally(() => {
          checking = undefined;
        });
      await checking;
    }
    return send(request);
  };
  const client = createSolanaRpcFromTransport(transport);
  if (rpcCache.size >= 20) rpcCache.delete(rpcCache.keys().next().value!);
  rpcCache.set(key, { client, expires: Date.now() + 60000 });
  return client;
}
const timeout = () => ({ abortSignal: AbortSignal.timeout(15000) });
export async function getSolanaBalances(wallet: string) {
  const balance = await solanaRpc()
    .getBalance(address(wallet), { commitment: "confirmed" })
    .send(timeout());
  const mint = process.env.SOLANA_USDC_MINT;
  let usdc: string | null = null;
  if (mint) {
    const tokens = await solanaRpc()
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
  const result = await solanaRpc()
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
  const genesis = await solanaRpc(solanaNetwork(), endpoint, false)
    .getGenesisHash()
    .send(timeout());
  if (genesis !== SOLANA_GENESIS[solanaNetwork()])
    throw new Error("DAS RPC network mismatch");
  const response = await quickNodeFetch()(endpoint, {
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
