import { expect, test } from "bun:test";
import { solanaRpc, SOLANA_GENESIS } from "./solana";
import { rpcReservation } from "./quicknode-budget";
test("Solana checks the full genesis hash once and rejects the wrong cluster before balance reads", async () => {
  const original = globalThis.fetch,
    oldNetwork = process.env.SOLANA_NETWORK;
  process.env.SOLANA_NETWORK = "devnet";
  let wrong = false;
  const calls: string[] = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const body = JSON.parse(
      input instanceof Request ? await input.text() : String(init?.body),
    );
    calls.push(body.method);
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result:
        body.method === "getGenesisHash"
          ? wrong
            ? SOLANA_GENESIS.mainnet
            : SOLANA_GENESIS.devnet
          : { context: { slot: 1 }, value: 0 },
    });
  }) as typeof fetch;
  try {
    const rpc = solanaRpc(
      "devnet",
      `https://rpc-fixture.invalid/${crypto.randomUUID()}`,
      false,
    );
    expect(
      (await rpc.getBalance("11111111111111111111111111111111" as never).send())
        .value,
    ).toBe(0n);
    await rpc.getBalance("11111111111111111111111111111111" as never).send();
    expect(calls.filter((m) => m === "getGenesisHash")).toHaveLength(1);
    calls.length = 0;
    wrong = true;
    await expect(
      solanaRpc(
        "devnet",
        `https://rpc-fixture.invalid/${crypto.randomUUID()}`,
        false,
      )
        .getBalance("11111111111111111111111111111111" as never)
        .send(),
    ).rejects.toThrow("network mismatch");
    expect(calls).toEqual(["getGenesisHash"]);
  } finally {
    globalThis.fetch = original;
    if (oldNetwork === undefined) delete process.env.SOLANA_NETWORK;
    else process.env.SOLANA_NETWORK = oldNetwork;
  }
});
test("QuickNode budgets all inspection and simulation reads while rejecting transaction submission", () => {
  for (const method of [
    "getAccountInfo",
    "getMultipleAccounts",
    "getLatestBlockhash",
    "getFeeForMessage",
    "isBlockhashValid",
    "simulateTransaction",
  ])
    expect(rpcReservation({ method })).toBe(1000);
  expect(() => rpcReservation({ method: "sendTransaction" })).toThrow();
});
test("Solana outage fallback is independently checked and cannot silently switch clusters", async () => {
  const original = globalThis.fetch,
    oldUrl = process.env.SOLANA_RPC_URL,
    oldNetwork = process.env.SOLANA_NETWORK;
  process.env.SOLANA_NETWORK = "devnet";
  process.env.SOLANA_RPC_URL = `https://fallback-fixture.invalid/${crypto.randomUUID()}`;
  let wrong = false,
    primaryCalls = 0;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input instanceof Request ? input.url : input),
      body = JSON.parse(
        input instanceof Request ? await input.text() : String(init?.body),
      );
    if (url.includes("primary-fixture")) {
      primaryCalls++;
      throw new Error("Simulated outage");
    }
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result:
        body.method === "getGenesisHash"
          ? wrong
            ? SOLANA_GENESIS.mainnet
            : SOLANA_GENESIS.devnet
          : { context: { slot: 1 }, value: 123 },
    });
  }) as typeof fetch;
  try {
    const rpc = solanaRpc(
      "devnet",
      `https://primary-fixture.invalid/${crypto.randomUUID()}`,
    );
    expect(
      (await rpc.getBalance("11111111111111111111111111111111" as never).send())
        .value,
    ).toBe(123n);
    await rpc.getBalance("11111111111111111111111111111111" as never).send();
    expect(primaryCalls).toBe(1);
    wrong = true;
    await expect(
      solanaRpc(
        "devnet",
        `https://primary-fixture.invalid/${crypto.randomUUID()}`,
      )
        .getBalance("11111111111111111111111111111111" as never)
        .send(),
    ).rejects.toThrow("network mismatch");
  } finally {
    globalThis.fetch = original;
    if (oldUrl === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = oldUrl;
    if (oldNetwork === undefined) delete process.env.SOLANA_NETWORK;
    else process.env.SOLANA_NETWORK = oldNetwork;
  }
});
