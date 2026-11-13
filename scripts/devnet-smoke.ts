import { createSolanaRpc, generateKeyPairSigner, lamports } from "@solana/kit";
// Ephemeral devnet key only, never written or logged. This is not a Privy/login test.
if (process.env.SOLANA_NETWORK === "mainnet")
  throw new Error("Devnet test refuses mainnet");
const rpc = createSolanaRpc("https://api.devnet.solana.com");
const wallet = await generateKeyPairSigner();
try {
  const sig = await rpc
    .requestAirdrop(wallet.address, lamports(10000000n), {
      commitment: "confirmed",
    })
    .send({ abortSignal: AbortSignal.timeout(20000) });
  console.log(
    JSON.stringify({
      network: "devnet",
      wallet: wallet.address,
      airdropSignature: sig,
      state: "submitted",
    }),
  );
  for (let i = 0; i < 15; i++) {
    const status = await rpc
      .getSignatureStatuses([sig], { searchTransactionHistory: true })
      .send();
    const s = status.value[0];
    if (s?.err) throw new Error("Devnet transaction failed");
    if (s && ["confirmed", "finalized"].includes(s.confirmationStatus ?? "")) {
      console.log(
        JSON.stringify({
          state: s.confirmationStatus,
          slot: s.slot.toString(),
          signature: sig,
        }),
      );
      process.exit(0);
    }
    await Bun.sleep(2000);
  }
  throw new Error("Devnet confirmation timed out; reconciliation required");
} catch (e) {
  console.error(
    "Devnet faucet/RPC test blocked:",
    e instanceof Error ? e.message : "Unknown provider error",
  );
  process.exit(1);
}
