import { expect, test } from "bun:test";
import {
  hashTypedData,
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  type TransactionReceipt,
  type Address,
} from "viem";
import { PERMIT2, evmChains, type EvmTypedData } from "@collectible/domain";
import {
  validateGaslessQuote,
  assertSettler,
  confirmedGrailReceipt,
  grailReleaseBlocker,
} from "./evm-trading";

// Named offline fixture, shaped after 0x's documented Gasless response. Never
// served to the UI and never submitted to a provider.
const fixtureInput = {
  chainId: 8453 as const,
  wallet: "0x1111111111111111111111111111111111111111" as const,
  buyToken: "0x2222222222222222222222222222222222222222" as const,
  sellAmount: "10000000",
  slippageBps: 50,
};
function simulatedGaslessQuote() {
  const td = {
    domain: { name: "Permit2", chainId: 8453, verifyingContract: PERMIT2 },
    primaryType: "PermitWitnessTransferFrom",
    types: {
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
    },
    message: {
      permitted: { token: evmChains[8453].paymentToken, amount: "10000000" },
      spender: "0x3333333333333333333333333333333333333333",
      nonce: "123",
      deadline: String(Math.floor(Date.now() / 1000) + 120),
      slippageAndActions: {
        recipient: fixtureInput.wallet,
        buyToken: fixtureInput.buyToken,
        minAmountOut: "995000000000000000",
        actions: ["0x12345678"],
      },
    },
  };
  return {
    liquidityAvailable: true,
    buyToken: fixtureInput.buyToken,
    sellToken: evmChains[8453].paymentToken,
    buyAmount: "1000000000000000000",
    minBuyAmount: "995000000000000000",
    sellAmount: "9900000",
    fees: {
      gasFee: {
        amount: "100000",
        token: evmChains[8453].paymentToken,
        type: "gas",
      },
      zeroExFee: null,
      integratorFee: null,
    },
    issues: {
      allowance: null,
      balance: null,
      simulationIncomplete: false,
      invalidSourcesPassed: [],
    },
    trade: {
      type: "settler_metatransaction",
      hash: hashTypedData(td as EvmTypedData),
      eip712: td,
    },
  };
}
test("gasless fixture binds chain, recipient, spend, slippage and typed-data hash", () => {
  expect(
    validateGaslessQuote(simulatedGaslessQuote(), fixtureInput).message
      .permitted.amount,
  ).toBe("10000000");
  for (const mutate of [
    (q: ReturnType<typeof simulatedGaslessQuote>) => {
      q.trade.eip712.domain.chainId = 4663;
    },
    (q: ReturnType<typeof simulatedGaslessQuote>) => {
      q.trade.eip712.message.permitted.amount = "10000001";
    },
    (q: ReturnType<typeof simulatedGaslessQuote>) => {
      q.trade.eip712.message.slippageAndActions.recipient =
        "0x4444444444444444444444444444444444444444" as typeof fixtureInput.wallet;
    },
    (q: ReturnType<typeof simulatedGaslessQuote>) => {
      q.minBuyAmount = "1";
      q.trade.eip712.message.slippageAndActions.minAmountOut = "1";
    },
    (q: ReturnType<typeof simulatedGaslessQuote>) => {
      q.trade.eip712.message.deadline = "1";
    },
    (q: ReturnType<typeof simulatedGaslessQuote>) => {
      q.trade.eip712.types.TokenPermissions.reverse();
    },
    (q: ReturnType<typeof simulatedGaslessQuote>) => {
      q.issues.simulationIncomplete = true;
    },
    (q: ReturnType<typeof simulatedGaslessQuote>) => {
      q.trade.hash = ("0x" + "0".repeat(64)) as `0x${string}`;
    },
  ]) {
    const q = simulatedGaslessQuote();
    mutate(q);
    expect(() => validateGaslessQuote(q, fixtureInput)).toThrow();
  }
});
test("onchain registry check rejects counterfeit and paused gasless Settlers", async () => {
  const original = globalThis.fetch;
  let paused = false;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const r = JSON.parse(String(init?.body));
    return Response.json(
      r.method === "eth_chainId"
        ? { jsonrpc: "2.0", id: r.id, result: "0x2105" }
        : paused
          ? {
              jsonrpc: "2.0",
              id: r.id,
              error: { code: 3, message: "execution reverted" },
            }
          : {
              jsonrpc: "2.0",
              id: r.id,
              result: encodeAbiParameters(
                [{ type: "address" }],
                ["0x3333333333333333333333333333333333333333"],
              ),
            },
    );
  }) as unknown as typeof fetch;
  try {
    await assertSettler(8453, "0x3333333333333333333333333333333333333333");
    await expect(
      assertSettler(8453, "0x4444444444444444444444444444444444444444"),
    ).rejects.toThrow();
    paused = true;
    await expect(
      assertSettler(8453, "0x3333333333333333333333333333333333333333"),
    ).rejects.toThrow();
  } finally {
    globalThis.fetch = original;
  }
});
test("a feature flag alone cannot release live Grail spending", () => {
  const saved = {
    key: process.env.ZEROX_API_KEY,
    mode: process.env.DEMO_MODE,
    enabled: process.env.ENABLE_GRAIL_TRADING,
    verified: process.env.GRAIL_TRADING_VERIFIED,
    testWallet: process.env.GRAIL_TEST_WALLET,
    testChain: process.env.GRAIL_TEST_CHAIN_ID,
  };
  try {
    process.env.ZEROX_API_KEY = "fixture-not-a-credential";
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
      ZEROX_API_KEY: saved.key,
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
  const q = { ...fixtureInput, minBuyAmount: "995000000000000000" };
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
