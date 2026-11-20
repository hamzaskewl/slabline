/** Real devnet transfers against an isolated test DB. Never signs a user's wallet.
 * bun --env-file=.env.devnet-usdc.local scripts/verify-usdc-roundtrip.ts */
import {
  generateKeyPairSigner,
  getTransactionDecoder,
  partiallySignTransaction,
  getBase64EncodedWireTransaction,
} from "@solana/kit";
import {
  getDb,
  users,
  walletLinks,
  fundingIntents,
  positions,
  eq,
} from "../packages/db/src/index";
import { withSolanaNetwork } from "../packages/integrations/src/solana";
import { usdcTransfers } from "../packages/integrations/src/devnet-usdc";
import { devnetUsdcChain } from "../packages/integrations/src/devnet-usdc-chain";
import { demoAccount, cashDemoReward } from "../packages/integrations/src/demo";
import { type UsdcTransfer } from "../packages/domain/src/index";
if (!process.env.DATABASE_URL?.includes("127.0.0.1:55435/"))
  throw new Error("Use the isolated local USDC test database on port 55435.");
await withSolanaNetwork("devnet", async () => {
  const wallet = await generateKeyPairSigner(),
    db = getDb();
  const [user] = await db
    .insert(users)
    .values({ privyId: `devnet-roundtrip:${crypto.randomUUID()}` })
    .returning();
  await db.insert(walletLinks).values({
    userId: user!.id,
    address: wallet.address,
    network: "devnet",
    verifiedAt: new Date(),
  });
  const owner = user!.id;
  await demoAccount(owner);
  const [winning] = await db
    .insert(positions)
    .values({
      userId: owner,
      idempotencyKey: `demo:position:${crypto.randomUUID()}`,
      state: "won",
      data: {
        eventTicker: "TEST",
        symbol: "GEMI-TEST",
        cost: "1",
        quantity: "2.5",
        side: "yes",
        payout: "2.5",
        replay: true,
        reward: {
          budget: "2.500000",
          state: "available",
          cardSpend: "0",
          remainder: "2.500000",
        },
      },
    })
    .returning();
  await cashDemoReward(owner, winning!.id);
  const balance = async () =>
    (
      await db
        .select()
        .from(fundingIntents)
        .where(eq(fundingIntents.idempotencyKey, `demo:account:${owner}`))
    )[0]!.amount;
  if ((await balance()) !== "102.500000")
    throw new Error("Cash claim did not credit ledger.");
  async function execute(direction: "withdraw" | "deposit", amount: string) {
    const t = await usdcTransfers.prepare(
      owner,
      crypto.randomUUID(),
      direction,
      wallet.address,
      amount,
    );
    const transaction = getTransactionDecoder().decode(
      Buffer.from(t.unsignedBase64!, "base64"),
    );
    const signed = getBase64EncodedWireTransaction(
      await partiallySignTransaction([wallet.keyPair], transaction),
    );
    let result: UsdcTransfer = await usdcTransfers.submit(owner, t.id, signed);
    for (let i = 0; i < 45 && result.state === "submitted"; i++) {
      await Bun.sleep(2000);
      result = await usdcTransfers.check(owner, t.id);
    }
    if (result.state !== "confirmed")
      throw new Error(
        `Transfer ${result.id} is ${result.state}; inspect before rerunning.`,
      );
    await usdcTransfers.check(owner, t.id);
    console.log(
      JSON.stringify({
        direction,
        amount,
        signature: result.signature,
        state: result.state,
        ledger: await balance(),
        walletBalance: await devnetUsdcChain.balance(wallet.address),
      }),
    );
    return result;
  }
  const withdraw = await execute("withdraw", "2.5");
  if ((await balance()) !== "100.000000")
    throw new Error("Withdrawal ledger mismatch.");
  const deposit = await execute("deposit", "2.5");
  if (
    (await balance()) !== "102.500000" ||
    (await devnetUsdcChain.balance(wallet.address)) !== "0.000000"
  )
    throw new Error("Roundtrip conservation failed.");
  await Bun.write(
    "artifacts/usdc-roundtrip.json",
    JSON.stringify(
      {
        network: "devnet",
        wallet: wallet.address,
        mint: withdraw.mint,
        withdraw: withdraw.signature,
        deposit: deposit.signature,
        cashClaim: "2.500000",
        finalLedger: await balance(),
        finalWallet: "0.000000",
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "Cash claim → withdrawal → wallet → deposit → ledger: verified on Solana devnet.",
  );
});
