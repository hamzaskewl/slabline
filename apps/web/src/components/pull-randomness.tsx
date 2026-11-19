"use client";

import { useState } from "react";
import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getAddressEncoder,
  getBase58Decoder,
  getProgramDerivedAddress,
  getTransactionDecoder,
  getTransactionEncoder,
  type Base64EncodedWireTransaction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { useConnectWallet } from "@privy-io/react-auth";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import type { PullOpening } from "@collectible/domain";
import { Button } from "./ui/button";
import { PullRetry } from "./pull-board";
import type { PullActions } from "./pull-account";

type RequestPlan = {
  payer: string;
  requestAddress: string;
  requestFeeLamports: string;
  seedHex: string;
  instruction: {
    programAddress: string;
    accounts: { address: string; role: AccountRole }[];
    dataBase64: string;
  };
};

const vrf = "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz";
const queue = "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh";
const slotHashes = "SysvarS1otHashes111111111111111111111111111";
const system = "11111111111111111111111111111111";
const encoder = new TextEncoder();
const devnetRpc = createSolanaRpc("https://api.devnet.solana.com");
const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

async function prepareTransaction(
  plan: RequestPlan,
  payer: string,
  programId: string | null,
  previousExpiry: string | null,
) {
  const program = address(plan.instruction.programAddress);
  if (
    program !== programId ||
    plan.payer !== payer ||
    !/^[a-f0-9]{64}$/.test(plan.seedHex)
  )
    throw new Error(
      "The prepared request does not match this wallet and seed.",
    );

  const seed = Uint8Array.from(plan.seedHex.match(/../g) ?? [], (byte) =>
    parseInt(byte, 16),
  );
  const data = Uint8Array.from(atob(plan.instruction.dataBase64), (char) =>
    char.charCodeAt(0),
  );
  const expected = [...encoder.encode("PULLREQ1"), ...seed];
  if (
    data.length !== expected.length ||
    !expected.every((byte, index) => data[index] === byte)
  )
    throw new Error(
      "The prepared instruction does not match the saved randomness seed.",
    );

  const [[receipt], [identity]] = await Promise.all([
    getProgramDerivedAddress({
      programAddress: program,
      seeds: [
        encoder.encode("pull-receipt"),
        getAddressEncoder().encode(address(payer)),
        seed,
      ],
    }),
    getProgramDerivedAddress({
      programAddress: program,
      seeds: [encoder.encode("identity")],
    }),
  ]);
  const accounts = plan.instruction.accounts;
  const expectedAccounts = [
    { address: payer, role: AccountRole.WRITABLE_SIGNER },
    { address: receipt, role: AccountRole.WRITABLE },
    { address: identity, role: AccountRole.READONLY },
    { address: queue, role: AccountRole.WRITABLE },
    { address: vrf, role: AccountRole.READONLY },
    { address: system, role: AccountRole.READONLY },
    { address: slotHashes, role: AccountRole.READONLY },
  ];
  if (
    accounts.length !== expectedAccounts.length ||
    !expectedAccounts.every(
      (account, index) =>
        account.address === accounts[index]?.address &&
        account.role === accounts[index]?.role,
    ) ||
    plan.requestAddress !== receipt
  )
    throw new Error(
      "The prepared MagicBlock request accounts could not be verified.",
    );

  const options = { abortSignal: AbortSignal.timeout(15000) };
  const [{ value: lifetime }, { value: saved }, blockHeight] =
    await Promise.all([
      devnetRpc.getLatestBlockhash({ commitment: "confirmed" }).send(options),
      devnetRpc
        .getAccountInfo(receipt, {
          encoding: "base64",
          commitment: "confirmed",
        })
        .send(options),
      previousExpiry && /^\d+$/.test(previousExpiry)
        ? devnetRpc.getBlockHeight({ commitment: "confirmed" }).send(options)
        : null,
    ]);
  if (
    blockHeight !== null &&
    previousExpiry &&
    blockHeight <= BigInt(previousExpiry)
  ) {
    throw new Error(
      "The previously signed request can still land on Devnet. Check the saved draw again once its blockhash expires.",
    );
  }
  if (saved && !(saved.owner === system && saved.data[0] === ""))
    throw new Error(
      "A receipt already exists on Devnet. Check the saved draw before preparing another request.",
    );
  const message = appendTransactionMessageInstruction(
    {
      programAddress: program,
      accounts: accounts.map((account) => ({
        ...account,
        address: address(account.address),
      })),
      data,
    },
    setTransactionMessageLifetimeUsingBlockhash(
      lifetime,
      setTransactionMessageFeePayer(
        address(payer),
        createTransactionMessage({ version: "legacy" }),
      ),
    ),
  );
  return {
    transaction: new Uint8Array(
      getTransactionEncoder().encode(compileTransaction(message)),
    ),
    expiry: lifetime.lastValidBlockHeight.toString(),
  };
}

export function PullRandomness({
  opening,
  actions,
}: {
  opening: PullOpening;
  actions: PullActions;
}) {
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const { signTransaction } = useSignTransaction();
  const storageKey = `slabline-pull-signature:${opening.id}`;
  const expiryKey = `slabline-pull-signature-expiry:${opening.id}`;
  const [expiry, setExpiry] = useState(() => {
    try {
      return localStorage.getItem(expiryKey);
    } catch {
      return null;
    }
  });
  const [signature, setSignature] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  });
  const [plan, setPlan] = useState<RequestPlan>();
  const [status, setStatus] = useState("");
  const wallet = wallets.find(
    (candidate) => candidate.address === opening.payer,
  );

  function saveSignature(value: string) {
    setSignature(value);
    try {
      localStorage.setItem(storageKey, value);
    } catch {}
  }

  async function check(requestSignature?: string) {
    const result = await actions.request<{
      opening: PullOpening;
      balance?: string;
    }>({
      action: "verify",
      id: opening.id,
      requestSignature,
    });
    actions.save(result.opening, result.balance);
    if (result.opening.state === "pending") {
      setStatus(
        requestSignature
          ? "Waiting for MagicBlock fulfillment. Check the saved request again shortly."
          : "Draw still pending. You can review the saved request or check again shortly.",
      );
    } else {
      try {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(expiryKey);
      } catch {}
    }
  }

  return (
    <div className="pull-stack">
      <p className="pull-muted" role="status">
        Draw pending · MagicBlock VRF on Solana Devnet
      </p>
      {opening.payer && (
        <p className="pull-wallet">
          Request wallet <code>{opening.payer}</code>
        </p>
      )}
      {!signature &&
        (wallet ? (
          !plan ? (
            <Button
              className="pull-action"
              disabled={actions.busy}
              onClick={() =>
                void actions.run(async () => {
                  const prepared = await actions.request<{
                    solanaRequest?: RequestPlan;
                    recoveredSignature?: string;
                  }>({ action: "prepare", id: opening.id });
                  if (prepared.recoveredSignature) {
                    saveSignature(prepared.recoveredSignature);
                    await check(prepared.recoveredSignature);
                  } else if (prepared.solanaRequest) {
                    setPlan(prepared.solanaRequest);
                  } else {
                    throw new Error(
                      "The devnet randomness request is unavailable.",
                    );
                  }
                })
              }
            >
              Review randomness request
            </Button>
          ) : (
            <>
              <dl className="pull-facts">
                <div>
                  <dt>MagicBlock request fee</dt>
                  <dd>{plan.requestFeeLamports} lamports</dd>
                </div>
                <div>
                  <dt>Devnet receipt</dt>
                  <dd>
                    <code>{plan.requestAddress}</code>
                  </dd>
                </div>
                <div>
                  <dt>Slabline devnet program</dt>
                  <dd>
                    <code>{plan.instruction.programAddress}</code>
                  </dd>
                </div>
              </dl>
              <p className="pull-muted">
                Solana also charges transaction fees and account rent. This
                request generates your pack draw.
              </p>
              <Button
                className="pull-action"
                disabled={actions.busy}
                onClick={() =>
                  void actions.run(async () => {
                    setPlan(undefined);
                    const { transaction, expiry: nextExpiry } =
                      await prepareTransaction(
                        plan,
                        wallet.address,
                        opening.programId,
                        expiry,
                      );
                    const signed = await signTransaction({
                      wallet,
                      transaction,
                      chain: "solana:devnet",
                    });
                    const decoder = getTransactionDecoder();
                    const original = decoder.decode(transaction);
                    const signedTransaction = decoder.decode(
                      signed.signedTransaction,
                    );
                    const signatureBytes =
                      signedTransaction.signatures[address(wallet.address)];
                    if (
                      !signatureBytes ||
                      original.messageBytes.length !==
                        signedTransaction.messageBytes.length ||
                      !original.messageBytes.every(
                        (byte, index) =>
                          byte === signedTransaction.messageBytes[index],
                      )
                    )
                      throw new Error(
                        "The wallet changed the prepared randomness transaction.",
                      );
                    const requestSignature =
                      getBase58Decoder().decode(signatureBytes);
                    saveSignature(requestSignature);
                    setExpiry(nextExpiry);
                    try {
                      localStorage.setItem(expiryKey, nextExpiry);
                    } catch {}
                    const encoded = btoa(
                      String.fromCharCode(...signed.signedTransaction),
                    ) as Base64EncodedWireTransaction;
                    await devnetRpc
                      .sendTransaction(encoded, {
                        encoding: "base64",
                        preflightCommitment: "confirmed",
                      })
                      .send({ abortSignal: AbortSignal.timeout(15000) });
                    await check(requestSignature);
                  })
                }
              >
                Sign devnet request
              </Button>
            </>
          )
        ) : (
          <PullRetry
            onClick={() =>
              void connectWallet({ walletChainType: "solana-only" })
            }
          >
            Connect request wallet
          </PullRetry>
        ))}
      <label className="pull-field">
        <span>Devnet request signature</span>
        <input
          placeholder="Paste a submitted transaction signature"
          value={signature}
          maxLength={88}
          disabled={actions.busy}
          onChange={(event) => {
            setSignature(event.target.value.trim());
            setStatus("");
          }}
        />
      </label>
      <Button
        variant="outline"
        className="pull-action"
        disabled={
          actions.busy || (!!signature && !signaturePattern.test(signature))
        }
        onClick={() =>
          void actions.run(async () => {
            if (signature) saveSignature(signature);
            await check(signature || undefined);
          })
        }
      >
        Check saved draw
      </Button>
      {signaturePattern.test(signature) && (
        <a
          className="pull-proof-link"
          href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
        >
          View devnet request transaction
        </a>
      )}
      {!!signature && (
        <p className="pull-muted">
          Check this signature before preparing a replacement. If the
          transaction was dropped, clear the field and review the request again.
        </p>
      )}
      {status && (
        <p className="pull-muted" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
