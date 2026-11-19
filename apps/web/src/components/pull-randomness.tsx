"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccountRole,
  address,
  blockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getAddressEncoder,
  getBase58Decoder,
  getProgramDerivedAddress,
  getTransactionDecoder,
  getTransactionEncoder,
  signature as solanaSignature,
  type TransactionMessageBytesBase64,
  type Base64EncodedWireTransaction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { useConnectWallet } from "@privy-io/react-auth";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import type { PullOpening } from "@collectible/domain";
import { pullRequestStatus } from "@/lib/pull-request-status";
import { Button } from "./ui/button";
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
  signal: AbortSignal,
  savedLifetime?: { blockhash: string; expiry: string },
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

  const options = rpcOptions(signal);
  const lifetime = savedLifetime
    ? {
        blockhash: blockhash(savedLifetime.blockhash),
        lastValidBlockHeight: BigInt(savedLifetime.expiry),
      }
    : (
        await devnetRpc
          .getLatestBlockhash({ commitment: "confirmed" })
          .send(options)
      ).value;
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
  const compiled = compileTransaction(message);
  const transaction = new Uint8Array(getTransactionEncoder().encode(compiled));
  if (!savedLifetime) {
    const [
      { value: balance },
      { value: receiptAccount },
      rent,
      { value: fee },
    ] = await Promise.all([
      devnetRpc
        .getBalance(address(payer), { commitment: "confirmed" })
        .send(options),
      devnetRpc
        .getAccountInfo(receipt, {
          encoding: "base64",
          commitment: "confirmed",
        })
        .send(options),
      devnetRpc
        .getMinimumBalanceForRentExemption(105n, { commitment: "confirmed" })
        .send(options),
      devnetRpc
        .getFeeForMessage(
          toBase64(compiled.messageBytes) as TransactionMessageBytesBase64,
          { commitment: "confirmed" },
        )
        .send(options),
    ]);
    if (
      receiptAccount &&
      !(receiptAccount.owner === system && receiptAccount.data[0] === "")
    )
      throw new UserError(
        "A Devnet request already exists. Check Your packs to view it.",
      );
    if (fee === null || plan.requestFeeLamports !== "500000")
      throw new UserError(
        "The Devnet fee could not be verified. Please try again.",
      );
    const rentShortfall =
      rent > (receiptAccount?.lamports ?? 0n)
        ? rent - (receiptAccount?.lamports ?? 0n)
        : 0n;
    const required = BigInt(plan.requestFeeLamports) + fee + rentShortfall;
    if (balance < required)
      throw new UserError(
        `Add at least ${sol(required - balance)} Devnet SOL to the request wallet, then open your pack.`,
      );
  }
  return {
    transaction,
    blockhash: lifetime.blockhash,
    expiry: lifetime.lastValidBlockHeight.toString(),
  };
}

class UserError extends Error {}

function sol(lamports: bigint) {
  const sol = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return fraction ? `${sol}.${fraction}` : sol.toString();
}

function rpcOptions(signal: AbortSignal) {
  return { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) };
}

function toBase64(bytes: ArrayLike<number>) {
  return btoa(String.fromCharCode(...Array.from(bytes)));
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function inspectSigned(
  transaction: Uint8Array,
  signed: Uint8Array,
  payer: string,
) {
  const decoder = getTransactionDecoder();
  const original = decoder.decode(transaction);
  const decoded = decoder.decode(signed);
  const signature = decoded.signatures[address(payer)];
  if (
    !signature ||
    original.messageBytes.length !== decoded.messageBytes.length ||
    !original.messageBytes.every(
      (byte, index) => byte === decoded.messageBytes[index],
    )
  )
    throw new UserError(
      "The wallet changed the reviewed request. Please try again.",
    );
  return getBase58Decoder().decode(signature);
}

type SavedRequest = {
  signature: string;
  expiry?: string;
  blockhash?: string;
  signedBase64?: string;
};

function loadRequest(id: string): SavedRequest | null {
  try {
    const saved = localStorage.getItem(`slabline-pull-request:${id}`);
    if (saved) {
      const request = JSON.parse(saved) as SavedRequest;
      if (signaturePattern.test(request.signature)) return request;
    }
    const signature = localStorage.getItem(`slabline-pull-signature:${id}`);
    const expiry = localStorage.getItem(`slabline-pull-signature-expiry:${id}`);
    if (signature && signaturePattern.test(signature))
      return { signature, expiry: expiry ?? undefined };
  } catch {}
  return null;
}

function storeRequest(id: string, request: SavedRequest | null) {
  try {
    if (request)
      localStorage.setItem(
        `slabline-pull-request:${id}`,
        JSON.stringify(request),
      );
    else localStorage.removeItem(`slabline-pull-request:${id}`);
    localStorage.removeItem(`slabline-pull-signature:${id}`);
    localStorage.removeItem(`slabline-pull-signature-expiry:${id}`);
  } catch {}
}

function wait(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = window.setTimeout(done, 2500);
    function done() {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export function PullRandomness({
  opening,
  actions,
  autoStart = false,
}: {
  opening: PullOpening;
  actions: PullActions;
  autoStart?: boolean;
}) {
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const { signTransaction } = useSignTransaction();
  const [signature, setSignature] = useState(opening.requestSignature ?? "");
  const [status, setStatus] = useState("");
  const controller = useRef<AbortController | null>(null);
  const started = useRef(false);
  const wallet = wallets.find(
    (candidate) => candidate.address === opening.payer,
  );

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const start = useCallback(() => {
    if (controller.current || actions.busy) return;
    const work = new AbortController();
    controller.current = work;
    const { signal } = work;

    async function verify(requestSignature: string) {
      const result = await actions.request<{
        opening: PullOpening;
        balance?: string;
      }>({
        action: "verify",
        id: opening.id,
        requestSignature,
      });
      signal.throwIfAborted();
      if (result.opening.state === "pending") return false;
      storeRequest(opening.id, null);
      actions.save(result.opening, result.balance);
      return true;
    }

    async function transactionStatus(request: SavedRequest) {
      const {
        value: [current],
      } = await devnetRpc
        .getSignatureStatuses([solanaSignature(request.signature)], {
          searchTransactionHistory: true,
        })
        .send(rpcOptions(signal));
      const finalizedHeight =
        !current && request.expiry && /^\d+$/.test(request.expiry)
          ? await devnetRpc
              .getBlockHeight({ commitment: "finalized" })
              .send(rpcOptions(signal))
          : undefined;
      const state = pullRequestStatus(
        current ?? null,
        finalizedHeight,
        request.expiry,
      );
      if (state === "replace" && !current && request.blockhash) {
        const { value: stillValid } = await devnetRpc
          .isBlockhashValid(blockhash(request.blockhash), {
            commitment: "finalized",
          })
          .send(rpcOptions(signal));
        if (stillValid) return "unseen";
      }
      return state;
    }

    async function prepare() {
      const result = await actions.request<{
        solanaRequest?: RequestPlan;
        recoveredSignature?: string;
      }>({
        action: "prepare",
        id: opening.id,
      });
      signal.throwIfAborted();
      return result;
    }

    async function send(request: SavedRequest) {
      signal.throwIfAborted();
      try {
        await devnetRpc
          .sendTransaction(
            request.signedBase64 as Base64EncodedWireTransaction,
            {
              encoding: "base64",
              preflightCommitment: "confirmed",
              maxRetries: 1n,
            },
          )
          .send(rpcOptions(signal));
      } catch (error) {
        signal.throwIfAborted();
        if (
          /insufficient (funds|lamports)|no record of a prior credit/i.test(
            String(error),
          )
        )
          throw new UserError(
            "Add Devnet SOL to the request wallet, then open your pack.",
          );
        // A transport failure can have delivered the exact signed message.
        // Check its status before requesting any replacement signature.
      }
    }

    async function draw() {
      setStatus("Checking the saved draw…");
      let request =
        loadRequest(opening.id) ??
        (opening.requestSignature
          ? { signature: opening.requestSignature }
          : null);
      let prepared = await prepare();
      let recovered = !!prepared.recoveredSignature;
      if (prepared.recoveredSignature) {
        request = { signature: prepared.recoveredSignature };
      } else if (request) {
        if (!request.expiry || !/^\d+$/.test(request.expiry)) {
          const { value: observed } = await devnetRpc
            .getLatestBlockhash({ commitment: "confirmed" })
            .send(rpcOptions(signal));
          // Older records lacked an expiry. Wait through a full blockhash
          // lifetime before treating an unseen request as dropped.
          request = {
            ...request,
            expiry: observed.lastValidBlockHeight.toString(),
          };
          storeRequest(opening.id, request);
        }
        const state = await transactionStatus(request);
        if (state === "replace") {
          prepared = await prepare();
          recovered = !!prepared.recoveredSignature;
          request = prepared.recoveredSignature
            ? { signature: prepared.recoveredSignature }
            : null;
          storeRequest(opening.id, request);
        } else if (
          state === "unseen" &&
          request.signedBase64 &&
          request.blockhash &&
          request.expiry &&
          opening.payer &&
          prepared.solanaRequest
        ) {
          const expected = await prepareTransaction(
            prepared.solanaRequest,
            opening.payer,
            opening.programId,
            signal,
            {
              blockhash: request.blockhash,
              expiry: request.expiry,
            },
          );
          if (
            inspectSigned(
              expected.transaction,
              fromBase64(request.signedBase64),
              opening.payer,
            ) !== request.signature
          )
            throw new UserError(
              "The saved transaction could not be verified. Your opening is still saved.",
            );
          await send(request);
        }
      }

      if (!request) {
        if (!wallet)
          throw new UserError(
            "Connect the wallet you selected to open this pack.",
          );
        if (!prepared.solanaRequest)
          throw new UserError(
            "The Devnet request is unavailable. Your opening is still saved.",
          );
        const reviewed = await prepareTransaction(
          prepared.solanaRequest,
          wallet.address,
          opening.programId,
          signal,
        );
        signal.throwIfAborted();
        setStatus("Approve opening in your wallet…");
        const signed = await signTransaction({
          wallet,
          transaction: reviewed.transaction,
          chain: "solana:devnet",
        }).catch(() => {
          throw new UserError(
            "Opening cancelled. Your wallet request was not approved.",
          );
        });
        request = {
          signature: inspectSigned(
            reviewed.transaction,
            signed.signedTransaction,
            wallet.address,
          ),
          signedBase64: toBase64(signed.signedTransaction),
          blockhash: reviewed.blockhash,
          expiry: reviewed.expiry,
        };
        // Closing before submission abandons the draft, including a wallet
        // signature returned after the dialog has already closed.
        signal.throwIfAborted();
        await actions.request({
          action: "submit",
          id: opening.id,
          requestSignature: request.signature,
        });
        storeRequest(opening.id, request);
        signal.throwIfAborted();
        setSignature(request.signature);
        setStatus("Submitting your opening…");
        await send(request);
      }

      setSignature(request.signature);
      setStatus("Waiting for the MagicBlock draw…");
      for (let attempt = 0; attempt < 18; attempt++) {
        signal.throwIfAborted();
        const state = recovered
          ? "finalized"
          : await transactionStatus(request);
        if (state === "replace") {
          const checked = await prepare();
          if (!checked.recoveredSignature) {
            storeRequest(opening.id, null);
            setSignature("");
            throw new UserError(
              "The Devnet request expired or failed. Please try again.",
            );
          }
          request = { signature: checked.recoveredSignature };
          recovered = true;
          setSignature(request.signature);
        }
        if (state === "finalized" && (await verify(request.signature))) return;
        await wait(signal);
      }
      setStatus("Your draw is still processing. Find it in Your packs.");
    }

    void actions
      .run(async () => {
        try {
          if (!navigator.locks) {
            await draw();
            return;
          }
          await navigator.locks.request(
            `slabline-pull-wallet:${opening.id}`,
            { ifAvailable: true },
            async (lock) => {
              if (!lock)
                throw new UserError("This draw is active in another tab.");
              signal.throwIfAborted();
              await draw();
            },
          );
        } catch (error) {
          if (signal.aborted) return;
          setStatus("");
          if (!loadRequest(opening.id) && !opening.requestSignature) {
            const cancelled = await actions.request<{
              opening: PullOpening;
              balance?: string;
            }>({ action: "cancel", id: opening.id });
            actions.save(cancelled.opening, cancelled.balance);
          }
          if (error instanceof UserError) throw error;
          throw new UserError(
            "Devnet is temporarily unavailable. Submitted packs are saved in Your packs.",
          );
        }
      })
      .finally(() => {
        if (controller.current === work) controller.current = null;
      });
  }, [
    actions,
    opening.id,
    opening.payer,
    opening.programId,
    signTransaction,
    wallet,
  ]);

  useEffect(() => {
    if (
      !autoStart ||
      actions.busy ||
      started.current ||
      (!wallet && !opening.requestSignature && !loadRequest(opening.id))
    )
      return;
    const task = window.setTimeout(() => {
      started.current = true;
      start();
    }, 0);
    return () => window.clearTimeout(task);
  }, [
    actions.busy,
    autoStart,
    start,
    wallet,
    opening.id,
    opening.requestSignature,
  ]);

  return (
    <div className="pull-stack">
      {status && (
        <p className="pull-muted" role="status">
          {status}
        </p>
      )}
      {actions.error && (
        <p className="pull-error" role="alert">
          {actions.error}
        </p>
      )}
      {!actions.busy && (
        <>
          <Button className="pull-action" onClick={start}>
            {signature ? "Check opening" : `Open $${opening.tier}`}
          </Button>
          {!wallet && (
            <Button
              variant="outline"
              onClick={() =>
                void connectWallet({ walletChainType: "solana-only" })
              }
            >
              Connect wallet
            </Button>
          )}
        </>
      )}
    </div>
  );
}
