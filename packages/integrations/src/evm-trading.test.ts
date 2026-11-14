import { expect, test } from "bun:test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  decodeFunctionData,
  decodeAbiParameters,
  zeroAddress,
  type TransactionReceipt,
  type Address,
} from "viem";
import {
  PERMIT2,
  evmChains,
  type GrailQuote,
  type PreparedGrailAction,
} from "@collectible/domain";
import {
  confirmedGrailReceipt,
  grailReleaseBlocker,
  assertGrailTransaction,
  grailSpend,
} from "./evm-trading";
import {
  encodeGrailAction,
  uniswap,
  v3Abi,
  v4Abi,
  permit2Abi,
  poolId,
  validatePoolKey,
  minimumOutput,
  effectiveV4Fee,
} from "./uniswap";
const fixtureInput = {
  chainId: 8453 as const,
  wallet: "0x1111111111111111111111111111111111111111" as const,
  buyToken: "0x2222222222222222222222222222222222222222" as const,
  sellAmount: "10000000",
  slippageBps: 50,
};
function simulatedDirectQuote(): GrailQuote {
  return {
    ...fixtureInput,
    sellToken: evmChains[8453].paymentToken,
    symbol: "Fixture",
    decimals: 18,
    paymentSymbol: "USDC",
    paymentDecimals: 6,
    protocol: "v3",
    router: uniswap[8453].routerV3,
    spender: uniswap[8453].routerV3,
    pool: "0x3333333333333333333333333333333333333333",
    feePips: 3000,
    buyAmount: "1000000000000000000",
    minBuyAmount: "995000000000000000",
    expiresAt: new Date(Date.now() + 90000).toISOString(),
    blockNumber: "100",
    nextAction: "swap",
    paymentBalance: "10000000",
    nativeBalance: "1000000000000000",
  };
}
test("v3 swap pins recipient, input, minimum and deadline; approval is exact", () => {
  const q = simulatedDirectQuote(),
    tx = encodeGrailAction(q),
    outer = decodeFunctionData({ abi: v3Abi, data: tx.data });
  expect(tx.to).toBe(uniswap[8453].routerV3);
  expect(tx.value).toBe("0x0");
  expect(outer.functionName).toBe("multicall");
  if (outer.functionName !== "multicall") throw Error();
  expect(outer.args[0]).toBe(
    BigInt(Math.floor(Date.parse(q.expiresAt) / 1000)),
  );
  const swap = decodeFunctionData({ abi: v3Abi, data: outer.args[1][0]! });
  if (swap.functionName !== "exactInputSingle") throw Error();
  expect(swap.args[0].recipient.toLowerCase()).toBe(q.wallet);
  expect(swap.args[0].amountIn).toBe(10000000n);
  expect(swap.args[0].amountOutMinimum).toBe(BigInt(q.minBuyAmount));
  const a = encodeGrailAction({ ...q, nextAction: "approve_token" }),
    decoded = decodeFunctionData({ abi: erc20Abi, data: a.data });
  if (decoded.functionName !== "approve") throw Error();
  expect(decoded.args[0].toLowerCase()).toBe(q.router);
  expect(decoded.args[1]).toBe(10000000n);
  expect(() => encodeGrailAction({ ...q, router: q.buyToken })).toThrow();
  expect(() =>
    encodeGrailAction({ ...q, nextAction: "approve_router" }),
  ).toThrow();
});
test("v4 uses bounded settle/take and no custom hooks or allow-revert commands", () => {
  const key = {
    currency0: fixtureInput.wallet,
    currency1: fixtureInput.buyToken,
    fee: 10000,
    tickSpacing: 200,
    hooks: zeroAddress,
  };
  const q: GrailQuote = {
    ...simulatedDirectQuote(),
    chainId: 4663,
    protocol: "v4",
    sellToken: key.currency0,
    router: uniswap[4663].routerV4,
    spender: PERMIT2,
    poolKey: key,
    pool: poolId(key),
  };
  const tx = encodeGrailAction(q),
    call = decodeFunctionData({ abi: v4Abi, data: tx.data });
  if (call.functionName !== "execute") throw Error();
  expect(call.args[0]).toBe("0x10");
  const [actions, params] = decodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    call.args[1][0]!,
  );
  expect(actions).toBe("0x060c0f");
  expect(
    decodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      params[1]!,
    )[1],
  ).toBe(BigInt(q.sellAmount));
  expect(
    decodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      params[2]!,
    )[1],
  ).toBe(BigInt(q.minBuyAmount));
  const approval = decodeFunctionData({
    abi: permit2Abi,
    data: encodeGrailAction({ ...q, nextAction: "approve_router" }).data,
  });
  if (approval.functionName !== "approve") throw Error();
  expect(approval.args[2]).toBe(BigInt(q.sellAmount));
  expect(approval.args[3]).toBeLessThan(Math.floor(Date.now() / 1000) + 600);
  expect(() =>
    validatePoolKey({ ...key, hooks: key.currency0 }, q.buyToken, q.pool),
  ).toThrow();
  expect(() =>
    validatePoolKey({ ...key, fee: 3000 }, q.buyToken, q.pool),
  ).toThrow();
  expect(effectiveV4Fee(4097000, 10000, true)).toBe(10990);
  expect(effectiveV4Fee(4097000, 10000, false)).toBe(10990);
});
test("quote slippage and payment precision cannot round up spend", () => {
  expect(minimumOutput(10000n, 50)).toBe(9950n);
  expect(() => minimumOutput(1n, 50)).toThrow();
  expect(() => minimumOutput(100n, 101)).toThrow();
  expect(() => grailSpend("0.0000001", simulatedDirectQuote())).toThrow();
  expect(() => grailSpend("26", simulatedDirectQuote())).toThrow();
  expect(() =>
    grailSpend("1", {
      ...simulatedDirectQuote(),
      sellToken: fixtureInput.wallet,
      paymentDecimals: 18,
    }),
  ).toThrow();
});
test("recovery hash must match exact calldata, sender, recipient, value and nonce", () => {
  const q = simulatedDirectQuote(),
    encoded = encodeGrailAction(q);
  const p: PreparedGrailAction = {
    action: "swap",
    transaction: {
      ...encoded,
      from: q.wallet,
      chainId: "0x2105",
      nonce: "0x7",
    },
    estimatedGasWei: "1",
    preparedAt: q.expiresAt,
    startBlock: "100",
  };
  const tx = {
    from: q.wallet,
    to: encoded.to,
    input: encoded.data,
    value: 0n,
    nonce: 7,
  };
  expect(() => assertGrailTransaction(p, tx)).not.toThrow();
  for (const change of [
    { from: q.buyToken },
    { to: q.buyToken },
    { input: "0x" as const },
    { value: 1n },
    { nonce: 8 },
  ])
    expect(() => assertGrailTransaction(p, { ...tx, ...change })).toThrow();
});
test("a feature flag alone cannot release live Grail spending", () => {
  const saved = {
    mode: process.env.DEMO_MODE,
    enabled: process.env.ENABLE_GRAIL_TRADING,
    verified: process.env.GRAIL_TRADING_VERIFIED,
    testWallet: process.env.GRAIL_TEST_WALLET,
    testChain: process.env.GRAIL_TEST_CHAIN_ID,
  };
  try {
    process.env.ENABLE_GRAIL_TRADING = "true";
    process.env.DEMO_MODE = "simulated";
    process.env.GRAIL_TRADING_VERIFIED = "false";
    expect(grailReleaseBlocker()).not.toBeNull();
    process.env.DEMO_MODE = "live";
    expect(grailReleaseBlocker()).not.toBeNull();
    process.env.GRAIL_TEST_WALLET = fixtureInput.wallet;
    process.env.GRAIL_TEST_CHAIN_ID = "8453";
    expect(grailReleaseBlocker(fixtureInput.wallet, 8453)).toBeNull();
    expect(grailReleaseBlocker(fixtureInput.wallet, 4663)).not.toBeNull();
    expect(grailReleaseBlocker(fixtureInput.buyToken, 8453)).not.toBeNull();
    process.env.ENABLE_GRAIL_TRADING = "false";
    expect(grailReleaseBlocker(fixtureInput.wallet, 8453)).not.toBeNull();
  } finally {
    for (const [key, value] of Object.entries({
      DEMO_MODE: saved.mode,
      ENABLE_GRAIL_TRADING: saved.enabled,
      GRAIL_TRADING_VERIFIED: saved.verified,
      GRAIL_TEST_WALLET: saved.testWallet,
      GRAIL_TEST_CHAIN_ID: saved.testChain,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

// Offline receipts intentionally include unrelated logs, outbound transfers and
// reverted/pending transactions: a provider status alone must never prove delivery.
test("confirmation requires net token delivery to the wallet, bounded spend and three blocks", () => {
  const counterparty = "0x3333333333333333333333333333333333333333";
  const q = {
    ...fixtureInput,
    sellToken: evmChains[8453].paymentToken,
    minBuyAmount: "995000000000000000",
  };
  const log = (address: Address, from: Address, to: Address, value: bigint) =>
    ({
      address,
      topics: encodeEventTopics({
        abi: erc20Abi,
        eventName: "Transfer",
        args: { from, to },
      }),
      data: encodeAbiParameters([{ type: "uint256" }], [value]),
    }) as TransactionReceipt["logs"][number];
  const receipt = (received = 1000000000000000000n, spent = 10000000n) => ({
    status: "success" as const,
    blockNumber: 100n,
    logs: [
      log(q.buyToken, counterparty, q.wallet, received),
      log(evmChains[8453].paymentToken, q.wallet, counterparty, spent),
    ],
  });
  expect(confirmedGrailReceipt(q, receipt(), 102n)).toBe("1000000000000000000");
  expect(confirmedGrailReceipt(q, receipt(), 101n)).toBeNull();
  expect(
    confirmedGrailReceipt(q, { ...receipt(), status: "reverted" }, 102n),
  ).toBeNull();
  expect(confirmedGrailReceipt(q, receipt(1n), 102n)).toBeNull();
  expect(
    confirmedGrailReceipt(q, receipt(undefined, 10000001n), 102n),
  ).toBeNull();
  expect(confirmedGrailReceipt(q, receipt(undefined, 0n), 102n)).toBeNull();
  expect(
    confirmedGrailReceipt({ ...q, wallet: counterparty }, receipt(), 102n),
  ).toBeNull();
  expect(
    confirmedGrailReceipt({ ...q, buyToken: counterparty }, receipt(), 102n),
  ).toBeNull();
  const roundTrip = receipt();
  roundTrip.logs.push(
    log(q.buyToken, q.wallet, counterparty, 1000000000000000000n),
  );
  expect(confirmedGrailReceipt(q, roundTrip, 102n)).toBeNull();
});
