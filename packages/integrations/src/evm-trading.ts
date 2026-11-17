import { z } from "zod";
import {
  createPublicClient,
  http,
  erc20Abi,
  decodeEventLog,
  parseUnits,
  toHex,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import {
  evmChains,
  evmAddress,
  evmHash,
  PERMIT2,
  type EvmChainId,
  type GrailQuote,
  type GrailMarket,
  type PreparedGrailAction,
} from "@collectible/domain";
import { listGrailTokens } from "./grail";
import { cached } from "./catalog";
import { quickNodeFetch } from "./quicknode-budget";
import {
  uniswap,
  v3Abi,
  v4Abi,
  permit2Abi,
  validatePoolKey,
  effectiveV4Fee,
  minimumOutput,
  encodeGrailAction,
} from "./uniswap";
export class EvmTradingError extends Error {}
export function evmClient(chainId: EvmChainId) {
  return createPublicClient({
    transport: http(
      process.env[chainId === 8453 ? "BASE_RPC_URL" : "ROBINHOOD_RPC_URL"] ||
        evmChains[chainId].rpc,
      {
        timeout: 10000,
        retryCount: 1,
        fetchFn: quickNodeFetch(evmChains[chainId].rpc),
      },
    ),
  });
}
export async function checkedClient(chainId: EvmChainId) {
  const c = evmClient(chainId);
  if ((await c.getChainId()) !== chainId)
    throw new EvmTradingError("RPC returned the wrong chain.");
  return c;
}
export function grailReleaseBlocker(wallet?: string, chainId?: EvmChainId) {
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

const detailSchema = z.object({
  chain_id: z.number(),
  token_address: evmAddress,
  pool_address: evmAddress,
  v4_pool: z
    .object({
      pool_manager_address: evmAddress,
      pool_id: evmHash,
      pool_key: z.object({
        currency0: evmAddress,
        currency1: evmAddress,
        fee: z.number().int(),
        tick_spacing: z.number().int(),
        hooks: evmAddress,
      }),
    })
    .nullable()
    .optional(),
});
export async function grailMarket(
  chainId: EvmChainId,
  buyToken: Address,
): Promise<GrailMarket> {
  const token = await findGrailToken(chainId, buyToken);
  return cached(
    `grail:pool:v2:${chainId}:${buyToken.toLowerCase()}`,
    60000,
    async () => {
      const r = await fetch(
        `https://grail.xyz/api/tokens/${encodeURIComponent(token.symbol)}/`,
        { signal: AbortSignal.timeout(12000) },
      );
      if (!r.ok)
        throw new EvmTradingError("Grail pool details are unavailable.");
      const d = detailSchema.parse(await r.json()),
        c = await checkedClient(chainId),
        cfg = uniswap[chainId];
      buyToken = buyToken.toLowerCase() as Address;
      if (d.chain_id !== chainId || d.token_address !== buyToken)
        throw new EvmTradingError("Grail pool identity mismatch.");
      let sellToken: Address,
        pool: Hex,
        feePips: number,
        protocol: "v3" | "v4",
        poolKey: GrailMarket["poolKey"];
      if (d.v4_pool) {
        protocol = "v4";
        pool = d.v4_pool.pool_id as Hex;
        poolKey = {
          ...d.v4_pool.pool_key,
          tickSpacing: d.v4_pool.pool_key.tick_spacing,
        };
        validatePoolKey(poolKey, buyToken, pool);
        if (d.v4_pool.pool_manager_address !== cfg.manager)
          throw new EvmTradingError("Unknown pool manager.");
        sellToken =
          poolKey.currency0 === buyToken
            ? poolKey.currency1
            : poolKey.currency0;
        const [manager, slot] = await Promise.all([
          c.readContract({
            address: cfg.routerV4,
            abi: v4Abi,
            functionName: "poolManager",
          }),
          c.readContract({
            address: cfg.stateView,
            abi: v4Abi,
            functionName: "getSlot0",
            args: [pool],
          }),
        ]);
        if (manager.toLowerCase() !== cfg.manager || slot[0] === 0n)
          throw new EvmTradingError("Unverified or uninitialized v4 pool.");
        feePips = effectiveV4Fee(
          slot[2],
          slot[3],
          sellToken === poolKey.currency0,
        );
      } else {
        protocol = "v3";
        pool = d.pool_address;
        const [a, b, fee, factory] = await Promise.all([
          c.readContract({ address: pool, abi: v3Abi, functionName: "token0" }),
          c.readContract({ address: pool, abi: v3Abi, functionName: "token1" }),
          c.readContract({ address: pool, abi: v3Abi, functionName: "fee" }),
          c.readContract({
            address: cfg.routerV3,
            abi: v3Abi,
            functionName: "factory",
          }),
        ]);
        const pair = [a.toLowerCase(), b.toLowerCase()];
        if (!pair.includes(buyToken) || factory.toLowerCase() !== cfg.factory)
          throw new EvmTradingError("Unverified v3 pool.");
        sellToken = (pair[0] === buyToken ? pair[1] : pair[0]) as Address;
        feePips = fee;
        const registered = await c.readContract({
          address: cfg.factory,
          abi: v3Abi,
          functionName: "getPool",
          args: [buyToken, sellToken, fee],
        });
        if (registered.toLowerCase() !== pool)
          throw new EvmTradingError("Pool is not registered with Uniswap.");
      }
      const [decimals, paymentDecimals, paymentSymbol] = await Promise.all([
        c.readContract({
          address: buyToken,
          abi: erc20Abi,
          functionName: "decimals",
        }),
        c.readContract({
          address: sellToken,
          abi: erc20Abi,
          functionName: "decimals",
        }),
        c.readContract({
          address: sellToken,
          abi: erc20Abi,
          functionName: "symbol",
        }),
      ]);
      if (decimals > 36 || paymentDecimals > 18)
        throw new EvmTradingError("Unsupported token precision.");
      return {
        chainId,
        buyToken,
        sellToken,
        symbol: token.symbol,
        decimals,
        paymentSymbol,
        paymentDecimals,
        protocol,
        pool,
        poolKey,
        feePips,
        router: protocol === "v3" ? cfg.routerV3 : cfg.routerV4,
        spender: protocol === "v3" ? cfg.routerV3 : PERMIT2,
      };
    },
  );
}
export function grailSpend(amount: string, market: GrailMarket) {
  if (
    !/^\d+(\.\d+)?$/.test(amount) ||
    (amount.split(".")[1]?.length ?? 0) > market.paymentDecimals
  )
    throw new EvmTradingError("Invalid payment amount or precision.");
  const cap =
    market.sellToken === evmChains[8453].paymentToken
      ? (process.env.GRAIL_MAX_TRADE_AMOUNT ?? "25")
      : (process.env.GRAIL_MAX_PEG_TRADE_AMOUNT ?? "0.01");
  const spend = parseUnits(amount, market.paymentDecimals);
  if (spend <= 0n || spend > parseUnits(cap, market.paymentDecimals))
    throw new EvmTradingError(
      `Enter more than zero and at most ${cap} ${market.paymentSymbol}.`,
    );
  return spend;
}
export async function quoteGrail(input: {
  chainId: EvmChainId;
  wallet: Address;
  buyToken: Address;
  sellAmount: string;
  slippageBps: number;
}): Promise<GrailQuote> {
  const m = await grailMarket(input.chainId, input.buyToken),
    c = await checkedClient(input.chainId),
    cfg = uniswap[input.chainId],
    amount = BigInt(input.sellAmount);
  if (amount <= 0n || amount >= 2n ** 128n)
    throw new EvmTradingError("Unsupported spend.");
  const blockNumber = await c.getBlockNumber();
  const [balance, native, allowance] = await Promise.all([
    c.readContract({
      address: m.sellToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [input.wallet],
      blockNumber,
    }),
    c.getBalance({ address: input.wallet, blockNumber }),
    c.readContract({
      address: m.sellToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [input.wallet, m.spender],
      blockNumber,
    }),
  ]);
  let nextAction: GrailQuote["nextAction"] =
    allowance < amount ? "approve_token" : "swap";
  if (m.protocol === "v4" && nextAction === "swap") {
    const a = await c.readContract({
      address: PERMIT2,
      abi: permit2Abi,
      functionName: "allowance",
      args: [input.wallet, m.sellToken, m.router],
      blockNumber,
    });
    if (a[0] < amount || a[1] < Math.floor(Date.now() / 1000) + 120)
      nextAction = "approve_router";
  }
  const result =
    m.protocol === "v3"
      ? await c.simulateContract({
          address: cfg.quoterV3,
          abi: v3Abi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: m.sellToken,
              tokenOut: m.buyToken,
              amountIn: amount,
              fee: m.feePips,
              sqrtPriceLimitX96: 0n,
            },
          ],
          blockNumber,
        })
      : await c.simulateContract({
          address: cfg.quoterV4,
          abi: v4Abi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              poolKey: m.poolKey!,
              zeroForOne: m.sellToken === m.poolKey!.currency0,
              exactAmount: amount,
              hookData: "0x",
            },
          ],
          blockNumber,
        });
  const output = result.result[0];
  return {
    ...m,
    wallet: input.wallet,
    sellAmount: amount.toString(),
    buyAmount: output.toString(),
    minBuyAmount: minimumOutput(output, input.slippageBps).toString(),
    slippageBps: input.slippageBps,
    expiresAt: new Date(Date.now() + 90000).toISOString(),
    blockNumber: blockNumber.toString(),
    nextAction,
    paymentBalance: balance.toString(),
    nativeBalance: native.toString(),
  };
}
export async function prepareGrail(
  q: GrailQuote,
): Promise<PreparedGrailAction> {
  const c = await checkedClient(q.chainId);
  if (Date.parse(q.expiresAt) < Date.now() + 15000)
    throw new EvmTradingError("Quote expired. Request a fresh quote.");
  const m = await grailMarket(q.chainId, q.buyToken);
  if (m.pool !== q.pool || m.sellToken !== q.sellToken || m.router !== q.router)
    throw new EvmTradingError("Pool changed. Request a fresh quote.");
  const balance = await c.readContract({
    address: q.sellToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [q.wallet],
  });
  if (balance < BigInt(q.sellAmount))
    throw new EvmTradingError(`Not enough ${q.paymentSymbol} in this wallet.`);
  const tx = encodeGrailAction(q);
  const gas = await c.estimateGas({ account: q.wallet, ...tx, value: 0n });
  const fee = gas * (await c.getGasPrice());
  if ((await c.getBalance({ address: q.wallet })) < fee)
    throw new EvmTradingError("Not enough ETH for gas. Sponsorship is off.");
  return {
    action: q.nextAction,
    transaction: {
      ...tx,
      from: q.wallet,
      chainId: toHex(q.chainId),
      nonce: toHex(
        await c.getTransactionCount({ address: q.wallet, blockTag: "pending" }),
      ),
    },
    estimatedGasWei: fee.toString(),
    preparedAt: new Date().toISOString(),
    startBlock: (await c.getBlockNumber()).toString(),
  };
}
export function assertGrailTransaction(
  p: PreparedGrailAction,
  tx: {
    from: Address;
    to: Address | null;
    input: Hex;
    value: bigint;
    nonce: number;
  },
) {
  const expected = p.transaction;
  if (
    tx.from.toLowerCase() !== expected.from.toLowerCase() ||
    tx.to?.toLowerCase() !== expected.to.toLowerCase() ||
    tx.input.toLowerCase() !== expected.data.toLowerCase() ||
    tx.value !== 0n ||
    tx.nonce !== Number(expected.nonce)
  )
    throw new EvmTradingError(
      "Transaction does not match this order�s wallet, amount, recipient or nonce.",
    );
}
export async function checkGrailTrade(
  q: GrailQuote,
  p: PreparedGrailAction,
  hash: Hex,
) {
  const c = await checkedClient(q.chainId);
  assertGrailTransaction(p, await c.getTransaction({ hash }));
  const receipt = await c.getTransactionReceipt({ hash }),
    head = await c.getBlockNumber();
  if (head < receipt.blockNumber + 2n) return { state: "pending" };
  if (receipt.status === "reverted") return { state: "failed" };
  if (p.action === "approve_token") {
    const allowance = await c.readContract({
      address: q.sellToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [q.wallet, q.spender],
    });
    return {
      state:
        allowance >= BigInt(q.sellAmount)
          ? "approval_confirmed"
          : "reconciliation_required",
    };
  }
  if (p.action === "approve_router") {
    const allowance = await c.readContract({
      address: PERMIT2,
      abi: permit2Abi,
      functionName: "allowance",
      args: [q.wallet, q.sellToken, q.router],
    });
    return {
      state:
        allowance[0] >= BigInt(q.sellAmount) &&
        allowance[1] > Math.floor(Date.now() / 1000)
          ? "approval_confirmed"
          : "reconciliation_required",
    };
  }
  const received = confirmedGrailReceipt(q, receipt, head);
  return received === null
    ? { state: "reconciliation_required" }
    : { state: "confirmed", received };
}
export async function evmBalances(
  chainId: EvmChainId,
  wallet: Address,
  buyToken: Address,
) {
  const m = await grailMarket(chainId, buyToken),
    c = await checkedClient(chainId);
  const [payment, token, native] = await Promise.all([
    c.readContract({
      address: m.sellToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet],
    }),
    c.readContract({
      address: buyToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet],
    }),
    c.getBalance({ address: wallet }),
  ]);
  return {
    payment: payment.toString(),
    token: token.toString(),
    native: native.toString(),
    decimals: m.decimals,
    paymentDecimals: m.paymentDecimals,
    paymentSymbol: m.paymentSymbol,
  };
}
export function confirmedGrailReceipt(
  q: Pick<
    GrailQuote,
    "wallet" | "sellToken" | "buyToken" | "minBuyAmount" | "sellAmount"
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
      if (log.address.toLowerCase() === q.sellToken.toLowerCase()) {
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
