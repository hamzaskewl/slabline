# Pull & Predict on Solana devnet

Pull & Predict's MagicBlock mode requests randomness on Solana devnet. MagicBlock verifies the oracle's cryptographic proof before calling the app's receipt program, which records 32 result bytes on-chain. The app reads the finalized receipt to draw from the opening's committed odds and card valuations. The 2% edge is an expected-value calculation over that inventory. [MagicBlock Solana VRF](https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/introduction/solana-vrf)

| Account                     | Address                                        |
| --------------------------- | ---------------------------------------------- |
| MagicBlock Solana VRF       | `Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz`  |
| MagicBlock base-layer queue | `Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh` |
| Pull receipt program        | `H8FMsd2jGRQomPQ9iFEhNsYif3Uko1WBoFbsNognWRWx` |

The receipt program invokes MagicBlock's scoped, regular-fee VRF request. Only the MagicBlock PDA scoped to this program may sign the callback. Each receipt is derived from the wallet and a 32-byte seed, and can accept a result once. The receipt includes the payer, seed, fulfillment state and random bytes. The request pays up to 500,000 devnet lamports in VRF fees plus receipt rent and Solana transaction fees. The receipt program rolls back any request that exceeds that VRF fee cap. [Scoped VRF wire format](https://github.com/magicblock-labs/solana-vrf/blob/692f98912cf028a95b28fd7879c310cde559fdb2/api/src/instruction.rs) · [MagicBlock fee constants](https://github.com/magicblock-labs/solana-vrf/blob/692f98912cf028a95b28fd7879c310cde559fdb2/api/src/consts.rs)

## Build and deploy the receipt program

Build using the Solana/Agave SBF tooling.

```sh
cargo test --manifest-path programs/pull-randomness/Cargo.toml
cargo build-sbf --manifest-path programs/pull-randomness/Cargo.toml
```

Deploy the resulting `pull_randomness.so` using a funded devnet-only deployer. Keep deployer and program keypair files out of the repository.

```sh
solana --url https://api.devnet.solana.com \
  --keypair /path/to/devnet-deployer.json \
  program deploy programs/pull-randomness/target/deploy/pull_randomness.so
```

Configure `PULL_RANDOMNESS=magicblock-devnet`, set `PULL_MAGICBLOCK_PROGRAM_ID` to the resulting receipt program address, and use a trusted Solana devnet RPC for `PULL_MAGICBLOCK_DEVNET_RPC_URL`. Keep the program upgrade authority under the deployer's control. The app trusts the specific deployed receipt program and its upgrade authority alongside MagicBlock and the configured RPC.

## Verify an opening

The app persists the opening seed and committed odds before the wallet requests randomness. The verifier requires a successful finalized transaction with the linked wallet as fee payer and a single matching draw request. It reads the receipt at or after that finalized request slot and checks the program owner, payer, seed and fulfillment state. A compatible wallet may add Compute Budget instructions. Off-chain inventory, odds and the selection algorithm are still required to reproduce the pack reward from the immutable receipt.

The app can recover a missing request signature from recent finalized receipt history. If the history is unavailable from the configured RPC, use a trusted archival devnet endpoint or recover the signature from the wallet. A pending receipt may remain unresolved if the oracle request expires before fulfillment.

## Devnet smoke test

After deploying the receipt program, run from the repository root with `PULL_MAGICBLOCK_PROGRAM_ID` set. The script requests faucet funds for an ephemeral payer by default. When public RPC faucet calls are unavailable, fund a devnet-only keypair via the Solana web faucet and set its local path in `PULL_SMOKE_DEVNET_KEYPAIR`. The smoke script sends a VRF request to devnet and prints the finalized receipt only after verification. [Solana faucet](https://faucet.solana.com/)

```sh
bun packages/integrations/scripts/magicblock-devnet-smoke.ts
```

The live devnet queue is owned by MagicBlock's VRF program. A finalized MagicBlock transaction confirmed that the deployed VRF program accepts scoped regular requests. The app smoke test requires a deployed receipt program and a funded devnet wallet. [Finalized MagicBlock devnet request](https://explorer.solana.com/tx/2NvmohJWzBmU6Unm8p8sb7jpRtT8sqUtoz2Apj6Ut9ow7N6mdC12sMW2ya2BbDitu5MvNHZPzQMtkHG7HQQ3pCgK?cluster=devnet)

Phygitals describes public VRF for its own packs. Its authenticated purchase API verifies payment and fulfills purchases using Phygitals' own draw, stock and odds. Pull & Predict uses MagicBlock directly for its own committed pack inventory. [Phygitals pack flow](https://www.phygitals.com/how-it-works) · [Phygitals public API](https://www.phygitals.com/docs/public-api)

## Verified deployment — November 19, 2026

The consumer compiled to Solana SBF and deployed to devnet as `H8FMsd2jGRQomPQ9iFEhNsYif3Uko1WBoFbsNognWRWx`. [Deployment transaction](https://explorer.solana.com/tx/5z91AikWKxXhSxjJuyh5D3EWfqMNGx1DuGuYxE7tjo3rTFUFeqBvhgjso9UEPv3LjeXX1MGntSUXnJUZqmFWLzsd?cluster=devnet).

A real wallet-signed request successfully fulfilled. The adapter independently verified the finalized receipt owner, seed, payer and random bytes at request slot 524109745. [Request transaction](https://explorer.solana.com/tx/3UDESGSfvnrc4oA4vFv1E2WuN74imaDMrpuYzNnLhRNhK8WbJfQk8iUcMW294cuSdFUUwFEuUaoicvoLLLRYY4Rk?cluster=devnet). [Fulfilled receipt](https://explorer.solana.com/address/3vZvxg4vQcJqsygDD2nE4nSGCHCEr6c1tZcEMypkzQJc?cluster=devnet).

The dedicated devnet deployer is `2vLk2UgyYMBbWS7sgHHAYZxPDGgEu71GCfZuCmPfxFjH`. Its keypair and the consumer program keypair are stored in Railway web-service variables `PULL_DEVNET_DEPLOYER_KEYPAIR_JSON` and `PULL_DEVNET_PROGRAM_KEYPAIR_JSON`. These are deployment credentials only; application requests remain signed by users. Neither keypair belongs in client code or Git. Configuration was saved with deployment skipped until the feature release.

A second integration check linked a persistent local demo opening to the real devnet request before submitting it: $25 debited once, a verified 0.6× result awarded $15, and the selected NO position consumed $14.88 for 48 contracts from an explicitly recorded depth fixture. The $0.12 remainder returned to demo cash and the portfolio showed the position. The oracle request cost 0.001688640 devnet SOL including rent and network fees. [Ledger-bound request](https://explorer.solana.com/tx/39XYTBMqsRcGSoeoDfJoR22AFUR23aCofHNsPJ3zUHjGFtBLUBF5HBGwMvPqcpFRD9bFvRv7QHJaxL3iSBsq4CbQ?cluster=devnet) · [Verified callback](https://explorer.solana.com/tx/k1ePGiXbESaRSoghqD74gsX6zxFYibYJkZvX7zMeB8W6rkhBAaZy7AjEh7v7vvGiCvznr2ba8md9pEwjfnJ5cpj?cluster=devnet). This verifies the internal ledger/VRF/position boundaries, not a user login or actual Gemini execution.
