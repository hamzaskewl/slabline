import {
  AccountRole,
  address,
  getAddressEncoder,
  getBase58Decoder,
  getProgramDerivedAddress,
  signature,
  type AccountMeta,
  type Address,
  type GetTransactionApiResponseJsonParsed,
} from "@solana/kit";
import { solanaRpc, withSolanaNetwork } from "./solana";

export const MAGICBLOCK_VRF_PROGRAM = address(
  "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz",
);
export const MAGICBLOCK_VRF_QUEUE = address(
  "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh",
);

const DEVNET_RPC = "https://api.devnet.solana.com";
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const SLOT_HASHES = address("SysvarS1otHashes111111111111111111111111111");
const COMPUTE_BUDGET = address("ComputeBudget111111111111111111111111111111");
const ACCOUNT_READ = { encoding: "base64", commitment: "finalized" } as const;
const TRANSACTION_READ = {
  encoding: "jsonParsed",
  maxSupportedTransactionVersion: 0,
  commitment: "finalized",
} as const;
const timeout = () => ({ abortSignal: AbortSignal.timeout(15000) });
const REQUEST_TAG = Buffer.from("PULLREQ1");
const RECEIPT_TAG = Buffer.from("PULLVRF1");
const RECEIPT_SIZE = 105;

type DrawRequest = { seedHex: string; payer: string };

export type MagicBlockDevnetVerification =
  | { status: "pending" }
  | {
      status: "fulfilled";
      randomnessHex: string;
      requestAddress: string;
      requestSignature: string;
      slot: string;
    };

function parseSeed(seedHex: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(seedHex) || /^0+$/.test(seedHex)) {
    throw new Error(
      "MagicBlock draw seed must be a nonzero 32-byte hex string",
    );
  }
  return Buffer.from(seedHex, "hex");
}

async function buildRequest(programId: Address, input: DrawRequest) {
  const payer = address(input.payer);
  const payerBytes = Buffer.from(getAddressEncoder().encode(payer));
  const seed = parseSeed(input.seedHex);
  const [[requestAddress], [identity]] = await Promise.all([
    getProgramDerivedAddress({
      programAddress: programId,
      seeds: ["pull-receipt", payerBytes, seed],
    }),
    getProgramDerivedAddress({
      programAddress: programId,
      seeds: ["identity"],
    }),
  ]);
  const accounts: AccountMeta[] = [
    { address: payer, role: AccountRole.WRITABLE_SIGNER },
    { address: requestAddress, role: AccountRole.WRITABLE },
    { address: identity, role: AccountRole.READONLY },
    { address: MAGICBLOCK_VRF_QUEUE, role: AccountRole.WRITABLE },
    { address: MAGICBLOCK_VRF_PROGRAM, role: AccountRole.READONLY },
    { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
    { address: SLOT_HASHES, role: AccountRole.READONLY },
  ];
  return {
    seed,
    payer,
    payerBytes,
    requestAddress,
    instruction: {
      programAddress: programId,
      accounts,
      data: Buffer.concat([REQUEST_TAG, seed]),
    },
  };
}

type BuiltRequest = Awaited<ReturnType<typeof buildRequest>>;
type RequestTransaction = GetTransactionApiResponseJsonParsed<0>;

function matchesRequest(
  transaction: RequestTransaction,
  expectedSignature: string,
  request: BuiltRequest,
) {
  const { message, signatures } = transaction.transaction;
  const [feePayer] = message.accountKeys;
  if (
    !transaction.meta ||
    transaction.meta.err !== null ||
    signatures[0] !== expectedSignature ||
    feePayer?.pubkey !== request.payer ||
    !feePayer.signer
  ) {
    return false;
  }

  // Compute Budget may be inserted by a wallet. A second app or transfer
  // instruction would let the same transaction pay for multiple draw receipts.
  const appInstructions = message.instructions.filter(
    (instruction) => instruction.programId !== COMPUTE_BUDGET,
  );
  const [instruction] = appInstructions;
  return (
    appInstructions.length === 1 &&
    !!instruction &&
    instruction.programId === request.instruction.programAddress &&
    "accounts" in instruction &&
    instruction.data === getBase58Decoder().decode(request.instruction.data) &&
    instruction.accounts.length === request.instruction.accounts.length &&
    request.instruction.accounts.every(
      (account, index) => account.address === instruction.accounts[index],
    )
  );
}

type RequestAccount = {
  owner: string;
  executable: boolean;
  data: readonly [string, string];
};

function readReceipt(account: RequestAccount, request: BuiltRequest) {
  const data = Buffer.from(account.data[0], "base64");
  if (
    account.owner !== request.instruction.programAddress ||
    account.executable ||
    account.data[1] !== "base64" ||
    data.length !== RECEIPT_SIZE ||
    !data.subarray(0, 8).equals(RECEIPT_TAG) ||
    !data.subarray(8, 40).equals(request.payerBytes) ||
    !data.subarray(40, 72).equals(request.seed) ||
    (data[72] !== 0 && data[72] !== 1)
  ) {
    throw new Error("Invalid MagicBlock draw receipt");
  }
  return data[72] === 1 ? data.subarray(73).toString("hex") : null;
}

export function createMagicBlockDevnetRandomness({
  programId,
  rpcUrl = DEVNET_RPC,
}: {
  programId: string;
  rpcUrl?: string;
}) {
  const program = address(programId);
  const rpc = () => solanaRpc("devnet", rpcUrl, false);
  const getTransaction = (
    client: ReturnType<typeof rpc>,
    txSignature: string,
  ): Promise<RequestTransaction | null> =>
    client
      .getTransaction(signature(txSignature), TRANSACTION_READ)
      .send(timeout());

  return {
    prepare(input: DrawRequest) {
      return withSolanaNetwork("devnet", async () => {
        const request = await buildRequest(program, input);
        const {
          value: [application, vrf, queue],
        } = await rpc()
          .getMultipleAccounts(
            [program, MAGICBLOCK_VRF_PROGRAM, MAGICBLOCK_VRF_QUEUE],
            { ...ACCOUNT_READ, dataSlice: { offset: 0, length: 0 } },
          )
          .send(timeout());
        if (
          !application?.executable ||
          !vrf?.executable ||
          queue?.owner !== MAGICBLOCK_VRF_PROGRAM
        ) {
          throw new Error(
            "MagicBlock draw program or oracle queue unavailable on devnet",
          );
        }

        return {
          seedHex: request.seed.toString("hex"),
          requestAddress: request.requestAddress,
          requestFeeLamports: "500000",
          instruction: request.instruction,
        };
      });
    },

    recoverRequestSignature(input: DrawRequest) {
      return withSolanaNetwork("devnet", async () => {
        const request = await buildRequest(program, input);
        const client = rpc();
        const { context, value: account } = await client
          .getAccountInfo(request.requestAddress, ACCOUNT_READ)
          .send(timeout());
        // An unsolicited SOL transfer can prefund an otherwise uninitialized PDA.
        if (
          !account ||
          (account.owner === SYSTEM_PROGRAM && account.data[0] === "")
        ) {
          return null;
        }
        readReceipt(account, request);

        const history = await client
          .getSignaturesForAddress(request.requestAddress, {
            commitment: "finalized",
            minContextSlot: context.slot,
            limit: 20,
          })
          .send(timeout());
        for (const entry of [...history].reverse()) {
          if (entry.err !== null) continue;
          const transaction = await getTransaction(client, entry.signature);
          if (
            transaction &&
            matchesRequest(transaction, entry.signature, request)
          ) {
            return entry.signature;
          }
        }
        throw new Error(
          "Existing MagicBlock request signature is unavailable from devnet history",
        );
      });
    },

    verify(input: DrawRequest & { requestSignature: string }) {
      return withSolanaNetwork(
        "devnet",
        async (): Promise<MagicBlockDevnetVerification> => {
          const request = await buildRequest(program, input);
          const { requestSignature } = input;
          const client = rpc();
          const transaction = await getTransaction(client, requestSignature);
          if (!transaction) return { status: "pending" };
          if (!matchesRequest(transaction, requestSignature, request)) {
            throw new Error(
              "MagicBlock request transaction does not match this draw",
            );
          }

          const { value: account } = await client
            .getAccountInfo(request.requestAddress, {
              ...ACCOUNT_READ,
              minContextSlot: transaction.slot,
            })
            .send(timeout());
          if (!account)
            throw new Error("Finalized MagicBlock draw receipt unavailable");

          const randomnessHex = readReceipt(account, request);
          if (randomnessHex === null) return { status: "pending" };
          return {
            status: "fulfilled",
            randomnessHex,
            requestAddress: request.requestAddress,
            requestSignature,
            slot: transaction.slot.toString(),
          };
        },
      );
    },
  };
}
