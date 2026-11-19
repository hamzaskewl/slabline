import { expect, test } from "bun:test";
import { address, getAddressEncoder, getBase58Decoder } from "@solana/kit";
import {
  createMagicBlockDevnetRandomness,
  MAGICBLOCK_VRF_PROGRAM,
  MAGICBLOCK_VRF_QUEUE,
} from "./magicblock-randomness";
import { SOLANA_GENESIS } from "./solana";

test("MagicBlock prepares a devnet draw and verifies a single finalized request and matching receipt", async () => {
  const payer = address("Vote111111111111111111111111111111111111111");
  const app = address("GqWqMEubSHgrqJCZ9zPfMHq6uQPZkr6EbiBy78j7engt");
  const loader = address("BPFLoaderUpgradeab1e11111111111111111111111");
  const systemProgram = address("11111111111111111111111111111111");
  const seedHex = "c3".repeat(32);
  const seed = Buffer.from(seedHex, "hex");
  const requestSignature = getBase58Decoder().decode(Buffer.alloc(64, 41));
  const fulfillmentSignature = getBase58Decoder().decode(Buffer.alloc(64, 42));
  const requestData = Buffer.concat([Buffer.from("PULLREQ1"), seed]);
  const randomness = Buffer.alloc(32, 17);
  const fulfillment = Buffer.concat([
    Buffer.from("PULLVRF1"),
    Buffer.from(getAddressEncoder().encode(payer)),
    seed,
    Buffer.from([1]),
    randomness,
  ]);
  let state:
    | "native-program"
    | "paused-queue"
    | "missing-tx"
    | "bad-tx"
    | "batched"
    | "pending"
    | "wrong-owner"
    | "wrong-seed"
    | "wrong-payer"
    | "invalid-state"
    | "dirty-pending"
    | "stale-receipt"
    | "prefunded"
    | "fulfilled" = "fulfilled";
  let requestAddress = "";
  let expectedAccounts: string[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input, init) => {
    const { method, params, id } = JSON.parse(
      input instanceof Request ? await input.text() : String(init?.body),
    );
    let result: unknown;
    switch (method) {
      case "getGenesisHash":
        result = SOLANA_GENESIS.devnet;
        break;
      case "getMultipleAccounts": {
        expect(params[0]).toEqual([
          app,
          MAGICBLOCK_VRF_PROGRAM,
          MAGICBLOCK_VRF_QUEUE,
        ]);
        const queueHeader = Buffer.alloc(20);
        queueHeader[0] = 3;
        if (state === "paused-queue") queueHeader[17] = 1;
        result = {
          context: { slot: 500 },
          value: [
            {
              executable: true,
              owner:
                state === "native-program"
                  ? "NativeLoader1111111111111111111111111111111"
                  : loader,
            },
            { executable: true },
            {
              owner: MAGICBLOCK_VRF_PROGRAM,
              executable: false,
              data: [queueHeader.toString("base64"), "base64"],
            },
          ],
        };
        break;
      }
      case "getTransaction": {
        expect(params[0]).toBe(requestSignature);
        expect(params[1].commitment ?? "finalized").toBe("finalized");
        const instruction = {
          programId: app,
          data: getBase58Decoder().decode(requestData),
          accounts:
            state === "bad-tx"
              ? [systemProgram, ...expectedAccounts.slice(1)]
              : expectedAccounts,
        };
        result =
          state === "missing-tx"
            ? null
            : {
                slot: 500,
                meta: { err: null },
                transaction: {
                  signatures: [requestSignature],
                  message: {
                    accountKeys: [{ pubkey: payer, signer: true }],
                    instructions:
                      state === "batched"
                        ? [instruction, instruction]
                        : [instruction],
                  },
                },
              };
        break;
      }
      case "getSignaturesForAddress":
        expect(params[0]).toBe(requestAddress);
        expect(params[1].minContextSlot).toBe(503);
        result = [
          { err: null, signature: fulfillmentSignature },
          { err: null, signature: requestSignature },
        ];
        break;
      case "getAccountInfo": {
        expect(params[1].commitment ?? "finalized").toBe("finalized");
        expect(params[0]).toBe(requestAddress);
        const bytes = Buffer.from(fulfillment);
        if (state === "pending") bytes.fill(0, 72);
        if (state === "wrong-seed") bytes[40] = 0;
        if (state === "wrong-payer") bytes[8] = bytes[8] === 0 ? 1 : 0;
        if (state === "invalid-state") bytes[72] = 2;
        if (state === "dirty-pending") bytes[72] = 0;
        const prefunded = state === "prefunded";
        result = {
          context: { slot: state === "stale-receipt" ? 499 : 503 },
          value: {
            owner: state === "wrong-owner" || prefunded ? systemProgram : app,
            executable: false,
            data: [prefunded ? "" : bytes.toString("base64"), "base64"],
          },
        };
        break;
      }
      default:
        throw new Error(`Unexpected RPC request ${method}`);
    }
    return Response.json({ jsonrpc: "2.0", id, result });
  }) as typeof fetch;

  try {
    const adapter = createMagicBlockDevnetRandomness({
      programId: app,
      rpcUrl: `https://rpc-fixture.invalid/${crypto.randomUUID()}`,
    });
    state = "native-program";
    await expect(adapter.prepare({ seedHex, payer })).rejects.toThrow(
      "unavailable on devnet",
    );
    state = "paused-queue";
    await expect(adapter.prepare({ seedHex, payer })).rejects.toThrow(
      "cannot accept requests",
    );
    state = "fulfilled";
    const prepared = await adapter.prepare({ seedHex, payer });
    expect(prepared.requestFeeLamports).toBe("500000");
    expect(prepared.instruction.programAddress).toBe(app);
    expect(prepared.instruction.data).toEqual(requestData);
    requestAddress = prepared.requestAddress;
    expectedAccounts = prepared.instruction.accounts.map(
      (account) => account.address,
    );
    expect(expectedAccounts[0]).toBe(payer);
    expect(expectedAccounts[1]).toBe(requestAddress);
    expect(expectedAccounts[3]).toBe(MAGICBLOCK_VRF_QUEUE);
    expect(expectedAccounts[4]).toBe(MAGICBLOCK_VRF_PROGRAM);

    const verify = () => adapter.verify({ seedHex, payer, requestSignature });
    state = "missing-tx";
    expect(await verify()).toEqual({ status: "pending" });
    state = "pending";
    expect(await verify()).toEqual({ status: "pending" });
    state = "bad-tx";
    await expect(verify()).rejects.toThrow("transaction does not match");
    state = "batched";
    await expect(verify()).rejects.toThrow("transaction does not match");
    for (const invalid of [
      "wrong-owner",
      "wrong-seed",
      "wrong-payer",
      "invalid-state",
      "dirty-pending",
    ] as const) {
      state = invalid;
      await expect(verify()).rejects.toThrow("Invalid MagicBlock draw receipt");
    }
    state = "stale-receipt";
    await expect(verify()).rejects.toThrow(
      "Finalized MagicBlock draw receipt unavailable",
    );
    state = "prefunded";
    expect(
      await adapter.recoverRequestSignature({ seedHex, payer }),
    ).toBeNull();
    state = "fulfilled";
    expect(await adapter.recoverRequestSignature({ seedHex, payer })).toBe(
      requestSignature,
    );
    expect(await verify()).toEqual({
      status: "fulfilled",
      randomnessHex: randomness.toString("hex"),
      requestAddress,
      requestSignature,
      slot: "500",
    });
  } finally {
    globalThis.fetch = original;
  }
});
