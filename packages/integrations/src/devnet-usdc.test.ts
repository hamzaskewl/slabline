import { test, expect } from "bun:test";
import {
  generateKeyPairSigner,
  blockhash,
  getTransactionDecoder,
  partiallySignTransaction,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
} from "@solana/kit";
import {
  getDb,
  users,
  walletLinks,
  fundingIntents,
  withdrawals,
  eq,
} from "@collectible/db";
import {
  buildUsdcTransfer,
  devnetUsdcConfiguration,
  type UsdcChain,
  type TransferOutcome,
} from "./devnet-usdc-chain";
import { createUsdcTransfers, usdcTransferAmount } from "./devnet-usdc";
import { inspectDemoMintSignature } from "./demo-nft";
import { withSolanaNetwork, SOLANA_USDC_MINTS } from "./solana";

async function rejects(action: Promise<unknown>, message: string) {
  let caught: unknown;
  try {
    await action;
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toContain(message);
}

const lifetime = {
  blockhash: blockhash("11111111111111111111111111111111"),
  lastValidBlockHeight: 500n,
};
test("test transfers reject mainnet, native USDC, invalid amounts and excess precision", () => {
  for (const value of [
    "0",
    "-1",
    "1e6",
    "1000001",
    "0.0000001",
    "NaN",
    "",
    "1.",
  ])
    expect(() => usdcTransferAmount(value)).toThrow();
  expect(usdcTransferAmount("0.000001")).toBe("0.000001");
  expect(usdcTransferAmount("1000000")).toBe("1000000.000000");
  expect(() => withSolanaNetwork("mainnet", devnetUsdcConfiguration)).toThrow();
  const before = process.env.SLABLINE_DEVNET_USDC_MINT;
  try {
    for (const mint of Object.values(SOLANA_USDC_MINTS)) {
      process.env.SLABLINE_DEVNET_USDC_MINT = mint;
      expect(() =>
        withSolanaNetwork("devnet", devnetUsdcConfiguration),
      ).toThrow();
    }
  } finally {
    if (before === undefined) delete process.env.SLABLINE_DEVNET_USDC_MINT;
    else process.env.SLABLINE_DEVNET_USDC_MINT = before;
  }
});

test("withdrawal and deposit use exact checked token instructions and require wallet approval", async () => {
  const [authority, wallet, mint] = await Promise.all([
    generateKeyPairSigner(),
    generateKeyPairSigner(),
    generateKeyPairSigner(),
  ]);
  for (const direction of ["withdraw", "deposit"] as const) {
    const draft = await buildUsdcTransfer(
      {
        id: crypto.randomUUID(),
        direction,
        amount: "12.345678",
        wallet: wallet.address,
      },
      mint.address,
      authority,
      lifetime,
      100n,
    );
    expect(() =>
      inspectDemoMintSignature(
        draft.unsignedBase64,
        draft.unsignedBase64,
        wallet.address,
      ),
    ).toThrow();
    const original = getTransactionDecoder().decode(
      Buffer.from(draft.unsignedBase64, "base64"),
    );
    const message = getCompiledTransactionMessageDecoder().decode(
      original.messageBytes,
    );
    if (message.version !== 0) throw new Error("Expected v0 transaction");
    const tokenInstruction = message.instructions.find(
      (i) => i.data?.[0] === (direction === "withdraw" ? 14 : 15),
    );
    expect(tokenInstruction).toBeDefined();
    expect(Buffer.from(tokenInstruction!.data!).readBigUInt64LE(1)).toBe(
      12345678n,
    );
    expect(tokenInstruction!.data![9]).toBe(6);
    const signed = getBase64EncodedWireTransaction(
      await partiallySignTransaction([wallet.keyPair], original),
    );
    expect(
      String(
        inspectDemoMintSignature(draft.unsignedBase64, signed, wallet.address),
      ),
    ).toBe(draft.signature);
    const other = await buildUsdcTransfer(
      {
        id: crypto.randomUUID(),
        direction,
        amount: "99",
        wallet: wallet.address,
      },
      mint.address,
      authority,
      lifetime,
      100n,
    );
    const substituted = getBase64EncodedWireTransaction(
      await partiallySignTransaction(
        [wallet.keyPair],
        getTransactionDecoder().decode(
          Buffer.from(other.unsignedBase64, "base64"),
        ),
      ),
    );
    expect(() =>
      inspectDemoMintSignature(
        draft.unsignedBase64,
        substituted,
        wallet.address,
      ),
    ).toThrow();
  }
});

test.skipIf(!process.env.DATABASE_URL)(
  "persisted transfers serialize debits, credit once, isolate users, and recover uncertain broadcasts",
  async () => {
    await withSolanaNetwork("devnet", async () => {
      const db = getDb();
      const [authority, wallet, mint] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
      ]);
      const [user, stranger] = await db
        .insert(users)
        .values([
          { privyId: `usdc-test:${crypto.randomUUID()}` },
          { privyId: `usdc-test:${crypto.randomUUID()}` },
        ])
        .returning();
      await db.insert(walletLinks).values({
        userId: user!.id,
        address: wallet.address,
        network: "devnet",
        verifiedAt: new Date(),
      });
      const outcomes = new Map<string, TransferOutcome>();
      let failBroadcast = false,
        broadcasts = 0;
      const chain: UsdcChain = {
        configuration: () => ({ configured: true, mint: mint.address }),
        balance: async () => "999.000000",
        prepare: (input) =>
          buildUsdcTransfer(input, mint.address, authority, lifetime, 100n),
        outcome: async (draft) => outcomes.get(draft.signature) ?? "pending",
        broadcast: async () => {
          broadcasts++;
          if (failBroadcast) throw new Error("RPC response lost");
        },
      };
      const flow = createUsdcTransfers(chain);
      const balance = async () =>
        (
          await db
            .select()
            .from(fundingIntents)
            .where(
              eq(fundingIntents.idempotencyKey, `demo:account:${user!.id}`),
            )
        )[0]!.amount;
      const sign = async (draft: { unsignedBase64?: string }) =>
        getBase64EncodedWireTransaction(
          await partiallySignTransaction(
            [wallet.keyPair],
            getTransactionDecoder().decode(
              Buffer.from(draft.unsignedBase64!, "base64"),
            ),
          ),
        );
      try {
        const key = crypto.randomUUID();
        const [a, b] = await Promise.all([
          flow.prepare(user!.id, key, "withdraw", wallet.address, "25"),
          flow.prepare(user!.id, key, "withdraw", wallet.address, "25"),
        ]);
        expect(a.id).toBe(b.id);
        expect(await balance()).toBe("75.000000");
        await rejects(
          flow.prepare(user!.id, key, "withdraw", wallet.address, "26"),
          "different details",
        );
        await rejects(
          flow.prepare(
            user!.id,
            crypto.randomUUID(),
            "withdraw",
            wallet.address,
            "25",
          ),
          "pending transfer",
        );
        await rejects(flow.check(stranger!.id, a.id), "not found");
        await rejects(flow.account(stranger!.id, wallet.address), "Verify");
        failBroadcast = true;
        expect((await flow.submit(user!.id, a.id, await sign(a))).state).toBe(
          "submitted",
        );
        expect(await balance()).toBe("75.000000");
        failBroadcast = false;
        await flow.submit(user!.id, a.id);
        expect(broadcasts).toBe(2);
        outcomes.set(a.signature, "confirmed");
        const confirmed = await Promise.all([
          flow.check(user!.id, a.id),
          flow.check(user!.id, a.id),
        ]);
        expect(confirmed.every((t) => t.state === "confirmed")).toBe(true);
        expect(await balance()).toBe("75.000000");
        expect(
          (await flow.account(user!.id)).transfers[0]!.unsignedBase64,
        ).toBeUndefined();
        const deposit = await flow.prepare(
          user!.id,
          crypto.randomUUID(),
          "deposit",
          wallet.address,
          "10.123456",
        );
        expect(await balance()).toBe("75.000000");
        await flow.submit(user!.id, deposit.id, await sign(deposit));
        outcomes.set(deposit.signature, "confirmed");
        await Promise.all([
          flow.check(user!.id, deposit.id),
          flow.check(user!.id, deposit.id),
        ]);
        expect(await balance()).toBe("85.123456");
        for (const outcome of ["failed", "expired"] as const) {
          const pending = await flow.prepare(
            user!.id,
            crypto.randomUUID(),
            "withdraw",
            wallet.address,
            "5",
          );
          outcomes.set(pending.signature, outcome);
          await Promise.all([
            flow.check(user!.id, pending.id),
            flow.check(user!.id, pending.id),
          ]);
          expect(await balance()).toBe("85.123456");
          expect((await flow.check(user!.id, pending.id)).state).toBe(
            "refunded",
          );
        }
        const failedDeposit = await flow.prepare(
          user!.id,
          crypto.randomUUID(),
          "deposit",
          wallet.address,
          "9",
        );
        outcomes.set(failedDeposit.signature, "failed");
        await flow.check(user!.id, failedDeposit.id);
        expect(await balance()).toBe("85.123456");
        await rejects(
          flow.prepare(
            user!.id,
            crypto.randomUUID(),
            "withdraw",
            wallet.address,
            "86",
          ),
          "too low",
        );
        // Wallet may submit the prepared transaction itself: its known payer ID still reconciles.
        const external = await flow.prepare(
          user!.id,
          crypto.randomUUID(),
          "deposit",
          wallet.address,
          "1",
        );
        outcomes.set(external.signature, "confirmed");
        expect((await flow.check(user!.id, external.id)).state).toBe(
          "confirmed",
        );
        expect(await balance()).toBe("86.123456");
      } finally {
        await db.delete(withdrawals).where(eq(withdrawals.userId, user!.id));
        await db
          .delete(fundingIntents)
          .where(eq(fundingIntents.userId, user!.id));
        await db.delete(walletLinks).where(eq(walletLinks.userId, user!.id));
        await db.delete(users).where(eq(users.id, user!.id));
        await db.delete(users).where(eq(users.id, stranger!.id));
      }
    });
  },
);
