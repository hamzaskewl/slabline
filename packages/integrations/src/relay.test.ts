import { expect, test } from "bun:test";
import { relayAmount, relayFormat, relayQuoteInput } from "@collectible/domain";
import {
  quoteRelay,
  relayStatus,
  assertRelayExecutionDisabled,
  relayCapabilities,
} from "./relay";
import { relayRecordView } from "./relay-store";

import {
  SIMULATED_RELAY_INPUT,
  simulatedRelayResponse,
  wallet,
  requestId,
} from "./relay-fixtures";

function provider(body: unknown = simulatedRelayResponse(), status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Response.json(body, { status });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
test("Relay route discovery reads solver currencies without invented chain IDs", async () => {
  const native = {
    address: "0x0000000000000000000000000000000000000000",
    symbol: "ETH",
    decimals: 18,
  };
  const p = provider({
    chains: [
      {
        id: 11155111,
        disabled: false,
        depositEnabled: true,
        solverCurrencies: [native],
      },
      {
        id: 84532,
        disabled: false,
        depositEnabled: true,
        solverCurrencies: [native],
      },
    ],
  });
  const result = await relayCapabilities(p.fetcher);
  const routes = result.find((r) => r.environment === "testnet")!.routes;
  expect(routes).toHaveLength(2);
  expect(routes.every((r) => r.available)).toBe(true);
  expect(routes.some((r) => r.id.includes("solana"))).toBe(false);
});
test("Relay requests are wallet-funded, fixed-route, exact-input previews without client calldata", async () => {
  const { calls, fetcher } = provider();
  const result = await quoteRelay(SIMULATED_RELAY_INPUT, fetcher);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe("https://api.testnets.relay.link/quote/v2");
  const body = JSON.parse(String(calls[0]!.init?.body));
  expect(body).toMatchObject({
    user: wallet,
    recipient: wallet,
    refundTo: wallet,
    amount: "10000000000000000",
    tradeType: "EXACT_INPUT",
    usePermit: false,
    useDepositAddress: false,
    subsidizeFees: false,
    subsidizeRent: false,
    topupGas: false,
    slippageTolerance: "50",
  });
  expect(body).not.toHaveProperty("depositFeePayer");
  expect(body).not.toHaveProperty("appFees");
  expect(calls[0]!.init?.redirect).toBe("error");
  expect(result.canExecute).toBe(false);
  expect(result.gasSponsorship).toBe(false);
  expect(result.fees.relayer.formatted).toBe("0.0001");
  expect(result.sourceBalanceAfterPrincipal).toBe("10000000000000000");
  expect(Date.parse(result.expiresAt) - Date.parse(result.quotedAt)).toBe(
    30000,
  );
  expect(JSON.stringify(result)).not.toContain("deadbeef");
  expect(JSON.stringify(result)).not.toContain("untrusted.invalid");
  expect(JSON.stringify(result)).not.toContain(
    "2222222222222222222222222222222222222222",
  );
});
test("Relay exact amounts preserve precision and reject excess precision, unsafe ranges and extra parameters", async () => {
  expect(
    relayAmount({ ...SIMULATED_RELAY_INPUT, amount: "0.000000000000000001" }),
  ).toBe("1");
  expect(relayFormat("10000000000000001", 18)).toBe("0.010000000000000001");
  expect(() =>
    relayAmount({ ...SIMULATED_RELAY_INPUT, amount: "0" }),
  ).toThrow();
  expect(() =>
    relayAmount({
      ...SIMULATED_RELAY_INPUT,
      routeId: "base-solana",
      amount: "1.0000001",
    }),
  ).toThrow("decimal places");
  expect(() =>
    relayQuoteInput.parse({ ...SIMULATED_RELAY_INPUT, subsidizeFees: true }),
  ).toThrow();
  const p = provider();
  await expect(
    quoteRelay(
      {
        ...SIMULATED_RELAY_INPUT,
        recipient: "0x3333333333333333333333333333333333333333",
      },
      p.fetcher,
    ),
  ).rejects.toThrow("same verified");
  expect(p.calls).toHaveLength(0);
});
test("Relay rejects substituted wallets, tokens, amounts, sponsored fees, deposits, signatures and excessive slippage", async () => {
  const cases: ((body: ReturnType<typeof simulatedRelayResponse>) => void)[] = [
    (b) => {
      b.details.recipient = "0x3333333333333333333333333333333333333333";
    },
    (b) => {
      b.details.currencyOut.currency.chainId = 8453;
    },
    (b) => {
      b.details.currencyOut.currency.address = wallet;
    },
    (b) => {
      b.details.currencyIn.amount = "1";
    },
    (b) => {
      b.details.currencyOut.minimumAmount = "1";
    },
    (b) => {
      b.fees.subsidized.amount = "1";
    },
    (b) => {
      b.fees.app.amount = "1";
    },
    (b) => {
      b.fees.gas.currency.chainId = 1;
    },
    (b) => {
      b.fees.relayer.currency.address = wallet;
    },
    (b) => {
      b.steps[0]!.depositAddress = wallet;
    },
    (b) => {
      b.steps[0]!.kind = "signature";
    },
    (b) => {
      b.steps[0]!.items[0]!.data.from =
        "0x3333333333333333333333333333333333333333";
    },
    (b) => {
      b.steps[0]!.items[0]!.data.value = "999999999999999999";
    },
  ];
  for (const mutate of cases) {
    const b = simulatedRelayResponse();
    mutate(b);
    await expect(
      quoteRelay(SIMULATED_RELAY_INPUT, provider(b).fetcher),
    ).rejects.toThrow("unsupported route");
  }
  const b = {
    ...simulatedRelayResponse(),
    feeSponsorship: { quoted: { selectedComponents: ["execution"] } },
  };
  await expect(
    quoteRelay(SIMULATED_RELAY_INPUT, provider(b).fetcher),
  ).rejects.toThrow("unsupported route");
});
test("Relay blocked wallets, rate limits, provider failures and timeouts do not leak response text or fabricate quotes", async () => {
  await expect(
    quoteRelay(
      SIMULATED_RELAY_INPUT,
      provider(
        {
          errorCode: "BLOCKED_WALLET_ADDRESS",
          message: "secret-provider-debug",
        },
        400,
      ).fetcher,
    ),
  ).rejects.toThrow("selected wallet");
  await expect(
    quoteRelay(
      SIMULATED_RELAY_INPUT,
      provider({ message: "secret-provider-debug" }, 429).fetcher,
    ),
  ).rejects.toThrow("Wait a minute");
  await expect(
    quoteRelay(
      SIMULATED_RELAY_INPUT,
      provider({ message: "secret-provider-debug" }, 503).fetcher,
    ),
  ).rejects.toThrow("unavailable");
  await expect(
    quoteRelay(SIMULATED_RELAY_INPUT, (async () => {
      throw new Error("secret-provider-debug");
    }) as unknown as typeof fetch),
  ).rejects.toThrow("did not respond");
});
test("Relay status uses the pinned endpoint and never treats reported success as independent confirmation", async () => {
  const q = await quoteRelay(SIMULATED_RELAY_INPUT, provider().fetcher);
  const p = provider({
    status: "success",
    originChainId: 11155111,
    destinationChainId: 84532,
    inTxHashes: [`0x${"cd".repeat(32)}`],
    txHashes: [`0x${"ef".repeat(32)}`],
  });
  const status = await relayStatus(q, p.fetcher);
  expect(p.calls[0]!.url).toBe(
    `https://api.testnets.relay.link/intents/status/v3?requestId=${requestId}`,
  );
  expect(status.providerState).toBe("success");
  expect(status.independentlyConfirmed).toBe(false);
  await expect(
    relayStatus(
      q,
      provider({ status: "success", destinationChainId: 1 }).fetcher,
    ),
  ).rejects.toThrow("could not be verified");
  const row = {
    id: crypto.randomUUID(),
    state: "quoted",
    data: {
      kind: "relay-preview",
      input: SIMULATED_RELAY_INPUT,
      quote: q,
      status,
    },
  } as never;
  const expired = relayRecordView(row, Date.parse(q.expiresAt) + 1);
  expect(expired.state).toBe("expired");
  expect(expired.canExecute).toBe(false);
  expect(expired.moneyMovedByApp).toBe(false);
});
test("Relay execution stays blocked even when live environment flags are enabled", () => {
  const old = process.env.ENABLE_RELAY;
  process.env.ENABLE_RELAY = "true";
  try {
    expect(() => assertRelayExecutionDisabled()).toThrow(
      "execution is disabled",
    );
  } finally {
    if (old === undefined) delete process.env.ENABLE_RELAY;
    else process.env.ENABLE_RELAY = old;
  }
});
