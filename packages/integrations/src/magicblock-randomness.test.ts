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
  const app = address("BPFLoaderUpgradeab1e11111111111111111111111");
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
    | "missing-tx"
    | "bad-tx"
    | "batched"
    | "pending"
    | "wrong-owner"
    | "wrong-seed"
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
      case "getMultipleAccounts":
        expect(params[0]).toEqual([
          app,
          MAGICBLOCK_VRF_PROGRAM,
          MAGICBLOCK_VRF_QUEUE,
        ]);
        result = {
          context: { slot: 500 },
          value: [
            { executable: true },
            { executable: true },
            { owner: MAGICBLOCK_VRF_PROGRAM, executable: false },
          ],
        };
        break;
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
        if (state === "pending") bytes[72] = 0;
        if (state === "wrong-seed") bytes[40] = 0;
        const prefunded = state === "prefunded";
        result = {
          context: { slot: 503 },
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
    state = "wrong-owner";
    await expect(verify()).rejects.toThrow("Invalid MagicBlock draw receipt");
    state = "wrong-seed";
    await expect(verify()).rejects.toThrow("Invalid MagicBlock draw receipt");
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
