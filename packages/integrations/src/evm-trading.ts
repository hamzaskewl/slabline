import { z } from "zod";
import {
  createPublicClient,
  http,
  erc20Abi,
  parseAbi,
  encodeFunctionData,
  hashTypedData,
  parseSignature,
  decodeEventLog,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import {
  evmChains,
  evmChainId,
  evmAddress,
  evmAmount,
  evmHash,
  PERMIT2,
  typedDataSchema,
  type EvmChainId,
  type GrailQuote,
  type EvmTypedData,
} from "@collectible/domain";
import { listGrailTokens } from "./grail";

export class EvmTradingError extends Error {}
export function evmClient(chainId: EvmChainId) {
  return createPublicClient({
    transport: http(
      process.env[chainId === 8453 ? "BASE_RPC_URL" : "ROBINHOOD_RPC_URL"] ||
        evmChains[chainId].rpc,
      { timeout: 10000, retryCount: 1 },
    ),
  });
}
export function grailReleaseBlocker(wallet?: string, chainId?: EvmChainId) {
  if (!process.env.ZEROX_API_KEY) return "0x API access is not configured.";
  if (
    process.env.DEMO_MODE !== "live" ||
    process.env.ENABLE_GRAIL_TRADING !== "true" ||
    (process.env.GRAIL_TRADING_VERIFIED !== "true" &&
      !(
        wallet &&
        /^0x[0-9a-fA-F]{40}$/.test(process.env.GRAIL_TEST_WALLET ?? "") &&
        wallet.toLowerCase() === process.env.GRAIL_TEST_WALLET?.toLowerCase() &&
        String(chainId) === process.env.GRAIL_TEST_CHAIN_ID
      ))
  )
    return "Token purchases are awaiting a verified live test and release approval.";
  return null;
}
export async function findGrailToken(chainId: EvmChainId, address: string) {
  const token = (await listGrailTokens()).find(
    (t) =>
      t.chainId === chainId &&
      t.address.toLowerCase() === address.toLowerCase(),
  );
  if (!token)
    throw new EvmTradingError("Token is not in Grail’s current catalog.");
  return token;
}
const registry = "0x00000000000004533Fe15556B1E086BB1A72cEae" as const;
const registryAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function prev(uint128 featureId) view returns (address)",
]);
// https://github.com/0xProject/0x-settler#how-do-i-find-the-most-recent-deployment
export async function assertSettler(chainId: EvmChainId, spender: Address) {
  const client = evmClient(chainId);
  if ((await client.getChainId()) !== chainId)
    throw new EvmTradingError("RPC returned the wrong chain.");
  const current = await client.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "ownerOf",
    args: [3n],
  });
  if (current.toLowerCase() === spender.toLowerCase()) return;
  const previous = await client.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "prev",
    args: [3n],
  });
  if (previous.toLowerCase() !== spender.toLowerCase())
    throw new EvmTradingError(
      "Swap spender is not an active 0x gasless Settler.",
    );
}
const fee = z
  .object({ amount: evmAmount, token: evmAddress, type: z.string() })
  .nullable();
const quoteSchema = z.object({
  liquidityAvailable: z.literal(true),
  buyToken: evmAddress,
  sellToken: evmAddress,
  buyAmount: evmAmount,
  minBuyAmount: evmAmount,
  sellAmount: evmAmount,
  fees: z.object({ gasFee: fee, zeroExFee: fee, integratorFee: fee }),
  issues: z.object({
    allowance: z.object({ actual: evmAmount, spender: evmAddress }).nullable(),
    balance: z.unknown().nullable(),
    simulationIncomplete: z.boolean(),
    invalidSourcesPassed: z.array(z.string()),
  }),
  trade: z.object({
    type: z.literal("settler_metatransaction"),
    hash: evmHash,
    eip712: typedDataSchema,
  }),
});
const witnessSchema = z
  .object({
    permitted: z.object({ token: evmAddress, amount: evmAmount }).strict(),
    spender: evmAddress,
    nonce: evmAmount,
    deadline: evmAmount,
    slippageAndActions: z
      .object({
        recipient: evmAddress,
        buyToken: evmAddress,
        minAmountOut: evmAmount,
        actions: z
          .array(z.string().regex(/^0x(?:[a-fA-F0-9]{2})+$/))
          .min(1)
          .max(100),
      })
      .strict(),
  })
  .strict();
const expectedTypes = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  PermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "slippageAndActions", type: "SlippageAndActions" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  SlippageAndActions: [
    { name: "recipient", type: "address" },
    { name: "buyToken", type: "address" },
    { name: "minAmountOut", type: "uint256" },
    { name: "actions", type: "bytes[]" },
  ],
};
export function validateGaslessQuote(
  raw: unknown,
  input: {
    chainId: EvmChainId;
    wallet: Address;
    buyToken: Address;
    sellAmount: string;
    slippageBps: number;
  },
  now = Date.now(),
) {
  const q = quoteSchema.parse(raw),
    td = q.trade.eip712,
    m = witnessSchema.parse(td.message);
  const payment = evmChains[input.chainId].paymentToken;
  if (
    td.primaryType !== "PermitWitnessTransferFrom" ||
    td.domain.name !== "Permit2" ||
    td.domain.chainId !== input.chainId ||
    td.domain.verifyingContract !== PERMIT2 ||
    td.domain.version !== undefined
  )
    throw new EvmTradingError("Unsupported signing domain.");
  if (
    Object.keys(td.types).sort().join() !==
      Object.keys(expectedTypes).sort().join() ||
    Object.entries(expectedTypes).some(
      ([key, fields]) =>
        JSON.stringify(td.types[key]) !== JSON.stringify(fields),
    )
  )
    throw new EvmTradingError("Unsupported signing schema.");
  if (
    q.buyToken !== input.buyToken.toLowerCase() ||
    q.sellToken !== payment ||
    m.permitted.token !== payment ||
    m.permitted.amount !== input.sellAmount ||
    m.slippageAndActions.recipient !== input.wallet.toLowerCase() ||
    m.slippageAndActions.buyToken !== q.buyToken ||
    m.slippageAndActions.minAmountOut !== q.minBuyAmount
  )
    throw new EvmTradingError(
      "Quote does not match the selected wallet, tokens or spend.",
    );
  if (
    BigInt(q.buyAmount) <= 0n ||
    BigInt(q.minBuyAmount) <= 0n ||
    BigInt(q.minBuyAmount) > BigInt(q.buyAmount) ||
    BigInt(q.minBuyAmount) * 10000n <
      BigInt(q.buyAmount) * BigInt(10000 - input.slippageBps)
  )
    throw new EvmTradingError("Quote exceeds the slippage limit.");
  if (
    BigInt(q.sellAmount) > BigInt(input.sellAmount) ||
    Number(m.deadline) * 1000 <= now + 15000 ||
    Number(m.deadline) * 1000 > now + 600000
  )
    throw new EvmTradingError(
      "Quote is expired or has an unsupported deadline.",
    );
  if (q.issues.balance !== null)
    throw new EvmTradingError("Insufficient payment-token balance.");
  if (q.issues.simulationIncomplete || q.issues.invalidSourcesPassed.length)
    throw new EvmTradingError(
      "The provider could not fully simulate this quote.",
    );
  if (q.issues.allowance && q.issues.allowance.spender !== PERMIT2)
    throw new EvmTradingError("Unexpected approval spender.");
  if (hashTypedData(td) !== q.trade.hash.toLowerCase())
    throw new EvmTradingError("Quote signature hash mismatch.");
  if (
    Object.values(q.fees).some(
      (f) => f && f.token !== payment && f.token !== q.buyToken,
    )
  )
    throw new EvmTradingError("Quote contains an unsupported fee token.");
  return { q, message: m };
}
async function zeroEx(path: string, init?: RequestInit) {
  if (!process.env.ZEROX_API_KEY)
    throw new EvmTradingError(
      "Add ZEROX_API_KEY to the web service’s Railway secrets to enable quotes.",
    );
  const response = await fetch(`https://api.0x.org${path}`, {
    ...init,
    headers: {
      "0x-api-key": process.env.ZEROX_API_KEY,
      "0x-version": "v2",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new EvmTradingError(
      response.status === 401 || response.status === 403
        ? "0x denied API or token access. Check Gasless API permissions."
        : response.status === 422
          ? "No supported executable route for this amount or token."
          : `0x request failed (${response.status}).`,
    );
  return response.json() as Promise<unknown>;
}
export async function quoteGrail(input: {
  chainId: EvmChainId;
  wallet: Address;
  buyToken: Address;
  sellAmount: string;
  slippageBps: number;
}): Promise<GrailQuote> {
  if (!process.env.ZEROX_API_KEY)
    throw new EvmTradingError(
      "Add ZEROX_API_KEY to the web service’s Railway secrets to enable quotes.",
    );
  const token = await findGrailToken(input.chainId, input.buyToken),
    chain = evmChains[input.chainId],
    client = evmClient(input.chainId);
  const [paymentDecimals, decimals] = await Promise.all([
    client.readContract({
      address: chain.paymentToken,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    client.readContract({
      address: input.buyToken,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);
  if (paymentDecimals !== 6 || decimals > 36)
    throw new EvmTradingError("Unsupported token decimals.");
  const raw = await zeroEx(
    `/gasless/quote?${new URLSearchParams({ chainId: String(input.chainId), taker: input.wallet, recipient: input.wallet, sellToken: chain.paymentToken, buyToken: input.buyToken, sellAmount: input.sellAmount, slippageBps: String(input.slippageBps) })}`,
  );
  const { q, message } = validateGaslessQuote(raw, input);
  await assertSettler(input.chainId, message.spender);
  // Deliberately never forward an unlimited provider Permit for signature.
  // Exact ERC20 approval requires its own wallet confirmation, then a new quote.
  const approvalRequired = !!q.issues.allowance;
  return {
    chainId: input.chainId,
    wallet: input.wallet,
    buyToken: input.buyToken,
    symbol: token.symbol,
    decimals,
    paymentSymbol: chain.paymentSymbol,
    sellAmount: input.sellAmount,
    buyAmount: q.buyAmount,
    minBuyAmount: q.minBuyAmount,
    fees: Object.entries(q.fees).flatMap(([key, f]) =>
      f
        ? [
            {
              label:
                key === "gasFee"
                  ? "Gas (paid in token)"
                  : key === "zeroExFee"
                    ? "0x fee"
                    : "App fee",
              amount: f.amount,
              symbol:
                f.token === chain.paymentToken
                  ? chain.paymentSymbol
                  : token.symbol,
              decimals: f.token === chain.paymentToken ? 6 : decimals,
            },
          ]
        : [],
    ),
    expiresAt: new Date(
      Math.min(Date.now() + 60000, Number(message.deadline) * 1000),
    ).toISOString(),
    approvalRequired,
    approvalTransaction: approvalRequired
      ? {
          to: chain.paymentToken,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [PERMIT2, BigInt(input.sellAmount)],
          }),
          value: "0x0",
        }
      : null,
    trade: q.trade,
  };
}
export async function submitGrail(q: GrailQuote, signature: Hex) {
  const parsed = parseSignature(signature);
  return z.object({ tradeHash: evmHash }).parse(
    await zeroEx("/gasless/submit", {
      method: "POST",
      body: JSON.stringify({
        chainId: q.chainId,
        trade: {
          type: q.trade.type,
          eip712: q.trade.eip712,
          signature: {
            r: parsed.r,
            s: parsed.s,
            v: Number(parsed.v ?? BigInt(27 + (parsed.yParity ?? 0))),
            signatureType: 2,
          },
        },
      }),
    }),
  );
}
export async function checkGrailTrade(q: GrailQuote, tradeHash: string) {
  const status = z
    .object({
      status: z.string(),
      transactions: z.array(z.object({ hash: evmHash })).default([]),
    })
    .parse(
      await zeroEx(
        `/gasless/status/${evmHash.parse(tradeHash)}?chainId=${q.chainId}`,
      ),
    );
  if (["failed", "reverted"].includes(status.status))
    return { state: "failed" as const };
  const client = evmClient(q.chainId);
  if ((await client.getChainId()) !== q.chainId)
    throw new EvmTradingError("RPC chain mismatch.");
  for (const transaction of status.transactions) {
    const receipt = await client.getTransactionReceipt({
      hash: transaction.hash as Hex,
    });
    const received = confirmedGrailReceipt(
      q,
      receipt,
      await client.getBlockNumber(),
    );
    if (received !== null)
      return {
        state: "confirmed" as const,
        transactionHash: transaction.hash,
        received,
      };
  }
  return { state: "pending" as const };
}
export function confirmedGrailReceipt(
  q: Pick<
    GrailQuote,
    "wallet" | "chainId" | "buyToken" | "minBuyAmount" | "sellAmount"
  >,
  receipt: Pick<TransactionReceipt, "status" | "logs" | "blockNumber">,
  head: bigint,
): string | null {
  if (receipt.status !== "success" || head < receipt.blockNumber + 2n)
    return null;
  let received = 0n,
    spent = 0n;
  for (const log of receipt.logs) {
    try {
      const event = decodeEventLog({
        abi: erc20Abi,
        eventName: "Transfer",
        data: log.data,
        topics: log.topics,
      });
      const { from, to, value } = event.args;
      if (log.address.toLowerCase() === q.buyToken.toLowerCase()) {
        if (to.toLowerCase() === q.wallet.toLowerCase()) received += value;
        if (from.toLowerCase() === q.wallet.toLowerCase()) received -= value;
      }
      if (log.address.toLowerCase() === evmChains[q.chainId].paymentToken) {
        if (from.toLowerCase() === q.wallet.toLowerCase()) spent += value;
        if (to.toLowerCase() === q.wallet.toLowerCase()) spent -= value;
      }
    } catch {
      /* Other event types do not prove receipt of the token. */
    }
  }

  return received >= BigInt(q.minBuyAmount) &&
    spent > 0n &&
    spent <= BigInt(q.sellAmount)
    ? received.toString()
    : null;
}

export async function verifyEvmMessage(
  chainId: EvmChainId,
  address: Address,
  message: string,
  signature: Hex,
) {
  const client = evmClient(chainId);
  if ((await client.getChainId()) !== chainId)
    throw new EvmTradingError("RPC chain mismatch.");
  return client.verifyMessage({ address, message, signature });
}
export async function verifyEvmTrade(q: GrailQuote, signature: Hex) {
  return evmClient(q.chainId).verifyHash({
    blockTag: "latest",
    hash: hashTypedData(q.trade.eip712),
    address: q.wallet,
    signature,
  });
}
export async function evmBalances(
  chainId: EvmChainId,
  wallet: Address,
  buyToken: Address,
) {
  const client = evmClient(chainId);
  if ((await client.getChainId()) !== chainId)
    throw new EvmTradingError("RPC chain mismatch.");
  const [payment, token, decimals, native] = await Promise.all([
    client.readContract({
      address: evmChains[chainId].paymentToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet],
    }),
    client.readContract({
      address: buyToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet],
    }),
    client.readContract({
      address: buyToken,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    client.getBalance({ address: wallet }),
  ]);
  return {
    payment: payment.toString(),
    token: token.toString(),
    decimals,
    native: native.toString(),
  };
}
