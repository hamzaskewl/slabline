import { expect, test } from "bun:test";
import {
  generateKeyPairSigner,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  getBase64EncodedWireTransaction,
  partiallySignTransaction,
  type TransactionMessageBytes,
} from "@solana/kit";
import {
  getTransferCheckedInstructionDataDecoder,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { address } from "@solana/kit";
import { buildDemoMint, inspectDemoMintSignature } from "./demo-nft";
import { rewardPaymentConfig, rewardPaymentSources } from "./reward-payment";
import { SOLANA_USDC_MINTS, SOLANA_GENESIS, withSolanaNetwork } from "./solana";
import {
  allocateDemoReward,
  cancelDemoCollectible,
  demoAccount,
  finalizeDemoReward,
} from "./demo";
import {
  getDb,
  users,
  orders,
  positions,
  settlements,
  fundingIntents,
  eq,
} from "@collectible/db";
import type { DemoCollectible } from "@collectible/domain";

async function rejects(promise: Promise<unknown>, message: string) {
  const result = await Promise.allSettled([promise]);
  expect(result[0]!.status).toBe("rejected");
  if (result[0]!.status === "rejected")
    expect(String(result[0]!.reason)).toContain(message);
}

test("funding reads spendable native USDC and reports only the remaining shortfall", async () => {
  const wallet = await generateKeyPairSigner(),
    recipient = await generateKeyPairSigner();
  const sources = await Promise.all(
    Array.from({ length: 4 }, () => generateKeyPairSigner()),
  );
  const keys = [
    "SOLANA_RPC_URL",
    "QUICKNODE_RPC_URL",
    "SOLANA_NETWORK",
  ] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  let funded = true;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as { id: number; method: string };
      const accounts = sources.map((source, i) => ({
        pubkey: source.address,
        account: {
          executable: false,
          lamports: 2039280,
          rentEpoch: 0,
          space: 165,
          owner: TOKEN_PROGRAM_ADDRESS,
          data: {
            program: "spl-token",
            space: 165,
            parsed: {
              type: "account",
              info: {
                owner: i === 3 ? recipient.address : wallet.address,
                mint: SOLANA_USDC_MINTS.devnet,
                state: i === 2 ? "frozen" : "initialized",
                tokenAmount: {
                  amount:
                    i === 0
                      ? "3000000"
                      : i === 1
                        ? funded
                          ? "5000000"
                          : "0"
                        : "100000000",
                  decimals: 6,
                  uiAmount: 0,
                  uiAmountString: "0",
                },
              },
            },
          },
        },
      }));
      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result:
          body.method === "getGenesisHash"
            ? SOLANA_GENESIS.devnet
            : { context: { slot: 1 }, value: accounts },
      });
    },
  });
  try {
    process.env.SOLANA_NETWORK = "devnet";
    process.env.SOLANA_RPC_URL = `http://127.0.0.1:${server.port}`;
    delete process.env.QUICKNODE_RPC_URL;
    const payment = {
      network: "devnet" as const,
      mint: SOLANA_USDC_MINTS.devnet,
      recipient: recipient.address,
    };
    const selected = await withSolanaNetwork("devnet", () =>
      rewardPaymentSources(wallet.address, "7.25", payment),
    );
    expect(selected.map((s) => s.amount)).toEqual([3_000_000n, 4_250_000n]);
    funded = false;
    await rejects(
      withSolanaNetwork("devnet", () =>
        rewardPaymentSources(wallet.address, "7.25", payment),
      ),
      "4.250000 more test USDC",
    );
    await rejects(
      withSolanaNetwork("devnet", () =>
        rewardPaymentSources(wallet.address, "7.25", {
          ...payment,
          mint: SOLANA_USDC_MINTS.mainnet,
        }),
      ),
      "Unexpected reward payment token",
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    server.stop(true);
  }
});

test("reward charge is exact native USDC, atomic with mint, and cannot be removed or changed", async () => {
  const wallet = await generateKeyPairSigner(),
    recipient = await generateKeyPairSigner(),
    source = await generateKeyPairSigner();
  const payment = {
    network: "devnet" as const,
    mint: SOLANA_USDC_MINTS.devnet,
    recipient: recipient.address,
  };
  const lifetime = {
    blockhash: "11111111111111111111111111111111",
    lastValidBlockHeight: 1000n,
  };
  const topUp = {
    amount: "7.25",
    payment,
    sources: [{ address: source.address, amount: 7_250_000n }],
  };
  const built = await buildDemoMint(
    wallet.address,
    "Spurs reward",
    "https://example.com/reward",
    lifetime,
    topUp,
  );
  const tx = getTransactionDecoder().decode(
    Buffer.from(built.unsignedBase64, "base64"),
  );
  const message = getCompiledTransactionMessageDecoder().decode(
    tx.messageBytes,
  );
  if (message.version !== 0 && message.version !== "legacy")
    throw new Error("Unexpected transaction version");
  const ix = message.instructions.find(
    (i) =>
      message.staticAccounts[i.programAddressIndex] === TOKEN_PROGRAM_ADDRESS,
  )!;
  const paymentData = getTransferCheckedInstructionDataDecoder().decode(
    ix.data!,
  );
  expect(paymentData.amount).toBe(7_250_000n);
  expect(paymentData.decimals).toBe(6);
  const [destination] = await findAssociatedTokenPda({
    owner: recipient.address,
    mint: address(payment.mint),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  expect(ix.accountIndices!.map((i) => message.staticAccounts[i])).toEqual([
    source.address,
    address(payment.mint),
    destination,
    wallet.address,
  ]);
  const ata = message.instructions.find(
    (i) =>
      message.staticAccounts[i.programAddressIndex] ===
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  )!;
  expect(Array.from(ata.data!)).toEqual([1]);
  expect(
    message.instructions.some(
      (i) =>
        message.staticAccounts[i.programAddressIndex] ===
        "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
    ),
  ).toBe(true);
  const signed = await partiallySignTransaction([wallet.keyPair], tx);
  expect(
    inspectDemoMintSignature(
      built.unsignedBase64,
      getBase64EncodedWireTransaction(signed),
      wallet.address,
    ),
  ).toBeTruthy();
  const changed = getBase64EncodedWireTransaction({
    ...signed,
    messageBytes: getCompiledTransactionMessageEncoder().encode({
      ...message,
      instructions: message.instructions.filter((i) => i !== ix),
    }) as TransactionMessageBytes,
  });
  expect(() =>
    inspectDemoMintSignature(built.unsignedBase64, changed, wallet.address),
  ).toThrow("changed");
  await rejects(
    buildDemoMint(wallet.address, "Card", "https://example.com", lifetime, {
      ...topUp,
      payment: {
        ...payment,
        network: "mainnet",
        mint: SOLANA_USDC_MINTS.mainnet,
      },
    }),
    "only accept Devnet",
  );
  await rejects(
    buildDemoMint(wallet.address, "Card", "https://example.com", lifetime, {
      ...topUp,
      amount: "7.250001",
    }),
    "Invalid reward payment",
  );
  await rejects(
    buildDemoMint(wallet.address, "Card", "https://example.com", lifetime, {
      ...topUp,
      payment: { ...payment, recipient: wallet.address },
    }),
    "Invalid reward payment",
  );
});

test.skipIf(!process.env.DATABASE_URL)(
  "5% funding survives concurrent claims and cancellation without unearned cash or repeat charges",
  async () => {
    const previous = process.env.REWARD_TOPUP_RECIPIENT_DEVNET;
    const recipient = await generateKeyPairSigner(),
      wallet = await generateKeyPairSigner();
    const db = getDb(),
      [user] = await db
        .insert(users)
        .values({ privyId: `topup-${crypto.randomUUID()}` })
        .returning();
    const userId = user!.id;
    try {
      const [position] = await db
        .insert(positions)
        .values({
          userId,
          idempotencyKey: `demo:position:${userId}:test`,
          state: "won",
          data: {
            eventTicker: "TEST",
            eventTitle: "Spurs",
            label: "San Antonio",
            symbol: "GEMI-TEST",
            side: "yes",
            quantity: "145",
            cost: "100",
            replay: true,
            reward: {
              budget: "145",
              state: "available",
              cardSpend: "0",
              remainder: "145",
            },
          },
        })
        .returning();
      const id = position!.id;
      const item = {
        name: "Reward",
        source: "grail" as const,
        sourceId: "base",
        sourceUrl: "https://example.com",
        cost: "140",
        image: null,
        wallet: wallet.address,
      };
      const extra = { ...item, sourceId: "extra", cost: "12.25" };
      delete process.env.REWARD_TOPUP_RECIPIENT_DEVNET;
      expect(rewardPaymentConfig("devnet")).toBeNull();
      await rejects(
        allocateDemoReward(
          userId,
          id,
          crypto.randomUUID(),
          [item, extra],
          "7.25",
        ),
        "not available",
      );
      process.env.REWARD_TOPUP_RECIPIENT_DEVNET = recipient.address;
      expect(rewardPaymentConfig("devnet")?.mint).toBe(
        SOLANA_USDC_MINTS.devnet,
      );
      await rejects(
        allocateDemoReward(
          userId,
          id,
          crypto.randomUUID(),
          [item, { ...extra, cost: "12.250001" }],
          "7.250001",
        ),
        "5% wallet limit",
      );
      await rejects(
        allocateDemoReward(userId, id, crypto.randomUUID(), [item, extra]),
        "contribution changed",
      );
      const key = crypto.randomUUID();
      await Promise.all([
        allocateDemoReward(userId, id, key, [item, extra], "7.25"),
        allocateDemoReward(userId, id, key, [item, extra], "7.25"),
      ]);
      let account = await demoAccount(userId);
      expect(account.collectibles).toHaveLength(2);
      expect(account.balance).toBe("100.000000");
      expect(account.history!.at(-1)!.value).toBe("245.000000");
      const base = account.collectibles.find((c) => c.sourceId === "base")!,
        paid = account.collectibles.find((c) => c.sourceId === "extra")!;
      expect(base.topUp).toBe("0.000000");
      expect(paid.topUp).toBe("7.250000");
      expect(paid.payment?.recipient).toBe(recipient.address);
      await cancelDemoCollectible(userId, base.id);
      account = await demoAccount(userId);
      expect(account.positions[0]!.reward?.remainder).toBe("140.000000");
      await rejects(
        allocateDemoReward(
          userId,
          id,
          crypto.randomUUID(),
          [{ ...item, sourceId: "too-high", cost: "146" }],
          "6",
        ),
        "5% wallet limit",
      );
      await allocateDemoReward(userId, id, crypto.randomUUID(), [
        { ...item, sourceId: "replacement", cost: "135" },
      ]);
      const rows = await db
        .select()
        .from(orders)
        .where(eq(orders.userId, userId));
      for (const row of rows.filter((r) => r.state !== "cancelled"))
        await db
          .update(orders)
          .set({ state: "confirmed" })
          .where(eq(orders.id, row.id));
      await finalizeDemoReward(userId, paid.id);
      expect((await demoAccount(userId)).positions[0]!.reward?.state).toBe(
        "allocated",
      );
      const paidRow = rows.find((r) => r.id === paid.id)!;
      await db
        .update(orders)
        .set({
          data: {
            ...(paidRow.data as DemoCollectible),
            paymentConfirmedAt: new Date().toISOString(),
          },
        })
        .where(eq(orders.id, paid.id));
      await Promise.all([
        finalizeDemoReward(userId, paid.id),
        finalizeDemoReward(userId, paid.id),
      ]);
      account = await demoAccount(userId);
      expect(account.balance).toBe("105.000000");
      expect(account.positions[0]!.reward?.topUp).toBe("7.250000");
      expect(account.positions[0]!.reward?.state).toBe("claimed");
      expect(account.history!.at(-1)!.value).toBe("252.250000");
    } finally {
      if (previous === undefined)
        delete process.env.REWARD_TOPUP_RECIPIENT_DEVNET;
      else process.env.REWARD_TOPUP_RECIPIENT_DEVNET = previous;
      for (const table of [settlements, orders, positions, fundingIntents])
        await db.delete(table).where(eq(table.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  },
);
