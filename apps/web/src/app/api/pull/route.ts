import { z } from "zod";
import {
  address,
  createSolanaRpc,
  signature as solanaSignature,
} from "@solana/kit";
import {
  activeMarket,
  pullThemeOutcomes,
  demoPositionContext,
  marketOutcomes,
  units,
  PULL_TIERS,
  type Book,
  type Market,
  type ProviderResult,
  type PullOpening,
} from "@collectible/domain";
import {
  assertPullRetry,
  cancelPull,
  submitPullRequest,
  clearFailedPullRequest,
  pullSubmissionExpiry,
  createMagicBlockDevnetRandomness,
  demoBuy,
  demoBuyQuote,
  DemoError,
  fulfillPull,
  openPull,
  pullAccount,
  pullBalance,
  pullOpening,
  pullOpeningByKey,
  pullPendingRequest,
  pullRandomnessMode,
  requireDemoNetwork,
  requireDemoWallet,
  type PullRandomnessConfig,
} from "@collectible/integrations";
import {
  apiRoute,
  ApiError,
  authenticate,
  boundedJson,
  requireOrigin,
} from "@/server/auth";
import { workerRead } from "@/server/router";

const id = z.string().uuid();
const target = {
  id,
  eventTicker: z.string().regex(/^[A-Za-z0-9_-]{1,150}$/),
  symbol: z.string().regex(/^GEMI-[A-Z0-9-]{1,115}$/),
  side: z.enum(["yes", "no"]),
};
const theme = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({
    kind: z.enum(["team", "player"]),
    label: z.string().trim().min(1).max(100),
  }),
]);
const action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("open"),
    key: id,
    tier: z.literal(PULL_TIERS),
    payer: z
      .string()
      .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
      .optional(),
    theme: theme.default({ kind: "all" }),
  }),
  z.object({ action: z.literal("prepare"), id }),
  z.object({ action: z.literal("cancel"), id }),
  z.object({
    action: z.literal("submit"),
    id,
    requestSignature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/),
  }),
  z.object({
    action: z.literal("verify"),
    id,
    requestSignature: z
      .string()
      .regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/)
      .optional(),
  }),
  z.object({ action: z.literal("quote"), ...target }),
  z.object({
    action: z.literal("redeem"),
    ...target,
    minimumContracts: z
      .string()
      .max(32)
      .regex(/^\d+(\.\d{1,6})?$/)
      .refine((value) => units(value) > 0n),
    maximumCost: z
      .string()
      .max(32)
      .regex(/^\d+(\.\d{1,6})?$/)
      .refine((value) => units(value) > 0n),
  }),
]);

function magicBlock(programId: string) {
  return createMagicBlockDevnetRandomness({
    programId,
    rpcUrl: process.env.PULL_MAGICBLOCK_DEVNET_RPC_URL,
  });
}

function response(value: unknown) {
  return Response.json(value, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

function route(
  request: Request,
  handler: (userId: string) => Promise<Response>,
) {
  return apiRoute(async () => {
    try {
      requireDemoNetwork(request.headers.get("x-market-network"));
      if (request.method === "POST") requireOrigin(request);
      const user = await authenticate(request);
      return await handler(user.id);
    } catch (error) {
      if (error instanceof DemoError)
        throw new ApiError(error.status, error.message);
      throw error;
    }
  }, request);
}

export function GET(request: Request) {
  return route(request, async (userId) =>
    response({
      ...(await pullAccount(userId)),
      randomnessMode: pullRandomnessMode(),
    }),
  );
}

async function prepare(userId: string, id: string) {
  const pending = await pullPendingRequest(userId, id);
  const randomness = magicBlock(pending.programId);
  try {
    const recoveredSignature =
      await randomness.recoverRequestSignature(pending);
    if (recoveredSignature) {
      await submitPullRequest(userId, id, recoveredSignature);
      return { recoveredSignature };
    }
    await clearExpiredSubmission(userId, pending.opening);
    const { seedHex, requestAddress, requestFeeLamports, instruction } =
      await randomness.prepare(pending);
    return {
      solanaRequest: {
        seedHex,
        requestAddress,
        requestFeeLamports,
        payer: pending.payer,
        instruction: {
          programAddress: instruction.programAddress,
          accounts: instruction.accounts,
          dataBase64: Buffer.from(instruction.data).toString("base64"),
        },
      },
    };
  } catch {
    throw new ApiError(
      503,
      "Devnet is temporarily unavailable. Please try again.",
    );
  }
}
const requestRpc = () =>
  createSolanaRpc(
    process.env.PULL_MAGICBLOCK_DEVNET_RPC_URL ??
      "https://api.devnet.solana.com",
  );
async function clearExpiredSubmission(userId: string, opening: PullOpening) {
  if (opening.state !== "pending" || !opening.requestSignature) return;
  const rpc = requestRpc();
  const options = { abortSignal: AbortSignal.timeout(10000) };
  const {
    value: [status],
  } = await rpc
    .getSignatureStatuses([solanaSignature(opening.requestSignature)], {
      searchTransactionHistory: true,
    })
    .send(options);
  const expiry = await pullSubmissionExpiry(userId, opening.id);
  const expired =
    !status &&
    expiry &&
    (await rpc.getBlockHeight({ commitment: "finalized" }).send(options)) >
      BigInt(expiry);
  if ((status?.err && status.confirmationStatus === "finalized") || expired)
    await clearFailedPullRequest(userId, opening.id, opening.requestSignature);
}

async function verifyOpening(
  userId: string,
  opening: PullOpening,
  providedSignature?: string,
) {
  if (opening.state !== "pending") {
    if (
      opening.proof &&
      (!providedSignature ||
        opening.proof.requestSignature === providedSignature)
    )
      return opening;
    throw new ApiError(409, "This pack has no matching onchain request.");
  }
  const pending = await pullPendingRequest(userId, opening.id);
  const randomness = magicBlock(pending.programId);
  const requestSignature =
    providedSignature ??
    (await randomness.recoverRequestSignature(pending).catch(() => {
      throw new ApiError(
        503,
        "Devnet request recovery is temporarily unavailable. Your pending pack is saved.",
      );
    }));
  if (!requestSignature) return pullOpening(userId, opening.id);
  const result = await randomness
    .verify({ ...pending, requestSignature })
    .catch(() => {
      throw new ApiError(
        409,
        "The devnet request could not be verified. Check its signature and retry.",
      );
    });
  if (result.status === "pending") return pullOpening(userId, opening.id);
  const { status: _status, ...proof } = result;
  return fulfillPull(userId, opening.id, {
    ...proof,
    seedHex: pending.seedHex,
    programId: pending.programId,
  });
}

function acceptingMarket(market: Market) {
  return (
    activeMarket(market) &&
    (!market.closesAt || Date.parse(market.closesAt) > Date.now())
  );
}

function acceptingContract(market: Market, symbol: string): boolean {
  return (
    acceptingMarket(market) &&
    (market.contracts.some(
      (contract) =>
        contract.symbol === symbol &&
        ["active", "open"].includes(contract.status.toLowerCase()),
    ) ||
      market.children.some((child) => acceptingContract(child, symbol)))
  );
}

async function prediction(eventTicker: string, symbol: string) {
  const [market, depth] = await Promise.all([
    workerRead<ProviderResult<Market | null>>(
      `/market?id=${encodeURIComponent(eventTicker)}`,
    ),
    workerRead<{ book: Book | null; observedAt?: string }>(
      `/book?symbol=${encodeURIComponent(symbol)}`,
    ),
  ]).catch(() => {
    throw new ApiError(
      503,
      "Market depth is temporarily unavailable. Your pack is still available.",
    );
  });
  const event = market.data;
  const contract =
    event &&
    marketOutcomes(event).find((contract) => contract.symbol === symbol);
  if (
    !event ||
    (market.source !== "live" && market.source !== "cache") ||
    !contract ||
    !acceptingContract(event, symbol)
  )
    throw new ApiError(
      409,
      "This prediction is no longer open. Choose another market.",
    );
  if (!depth.book || depth.book.symbol !== symbol || depth.book.stale)
    throw new ApiError(503, "Prices are still loading. Please try again.");
  return {
    market: event,
    eventTicker: event.ticker ?? eventTicker,
    eventTitle: event.title,
    label: contract.label,
    book: depth.book,
    observedAt: depth.observedAt,
    context: demoPositionContext(event, contract),
  };
}

export async function POST(request: Request) {
  return route(request, async (userId) => {
    const parsed = action.safeParse(await boundedJson(request));
    if (!parsed.success)
      throw new ApiError(400, "Invalid Pull & Predict request.");
    const input = parsed.data;
    async function openingResponse(
      opening: PullOpening,
      request?: Awaited<ReturnType<typeof prepare>>,
    ) {
      const balance = await pullBalance(userId);
      return response({ opening, balance, ...request });
    }
    if (input.action === "open") {
      const payer = input.payer ?? null;
      const previous = await pullOpeningByKey(userId, input.key);
      if (previous) {
        assertPullRetry(previous, input.tier, payer, input.theme);
        return openingResponse(previous);
      }
      const mode = pullRandomnessMode();
      let randomness: PullRandomnessConfig = { source: "demo-csprng" };
      if (mode === "magicblock-devnet") {
        let programId: string;
        try {
          programId = address(process.env.PULL_MAGICBLOCK_PROGRAM_ID ?? "");
        } catch {
          throw new ApiError(
            503,
            "The MagicBlock devnet consumer program has not been configured.",
          );
        }
        if (!payer)
          throw new ApiError(409, "Choose a verified devnet Solana wallet.");
        await requireDemoWallet(userId, payer);
        randomness = { source: mode, payer, programId };
      } else if (payer) {
        throw new ApiError(
          409,
          "This practice draw does not use a Solana wallet.",
        );
      }
      const opening = await openPull(
        userId,
        input.key,
        input.tier,
        randomness,
        input.theme,
      );
      return openingResponse(opening);
    }

    const opening = await pullOpening(userId, input.id);
    if (input.action === "cancel") {
      if (opening.state === "pending" && !opening.requestSignature) {
        // Recover requests made by older clients before releasing a reservation.
        const pending = await pullPendingRequest(userId, opening.id);
        const signature = await magicBlock(
          pending.programId,
        ).recoverRequestSignature(pending);
        if (signature)
          return openingResponse(
            await submitPullRequest(userId, opening.id, signature),
          );
      }
      return openingResponse(await cancelPull(userId, opening.id));
    }
    if (input.action === "submit") {
      await clearExpiredSubmission(userId, opening);
      // The server observes a later blockhash lifetime than the already-signed
      // transaction. Never trust a client-provided expiry to release funds.
      const { value: lifetime } = await requestRpc()
        .getLatestBlockhash({ commitment: "confirmed" })
        .send({ abortSignal: AbortSignal.timeout(10000) });
      return openingResponse(
        await submitPullRequest(
          userId,
          opening.id,
          input.requestSignature,
          lifetime.lastValidBlockHeight.toString(),
        ),
      );
    }
    if (input.action === "prepare")
      return openingResponse(opening, await prepare(userId, opening.id));
    if (input.action === "verify")
      return openingResponse(
        await verifyOpening(userId, opening, input.requestSignature),
      );
    if (input.action === "redeem" && opening.state === "redeemed") {
      if (
        opening.redemption?.symbol !== input.symbol ||
        opening.redemption.side !== input.side
      )
        throw new ApiError(
          409,
          "This pack was already used on another prediction.",
        );
      return openingResponse(opening);
    }
    if (opening.state !== "ready" || !opening.budget)
      throw new ApiError(409, "This pack has no available buying budget.");
    const current = await prediction(input.eventTicker, input.symbol);
    if (
      !pullThemeOutcomes(current.market, opening.theme).some(
        (outcome) => outcome.symbol === input.symbol,
      )
    )
      throw new ApiError(
        409,
        "Choose a prediction for this pack’s selected team or player.",
      );
    const entry = { stake: opening.budget, side: input.side, replay: false };
    if (input.action === "quote")
      return response({
        quote: demoBuyQuote(entry, current.book, current.observedAt),
      });
    await demoBuy(
      userId,
      `pull:${opening.id}`,
      {
        ...entry,
        eventTicker: current.eventTicker,
        eventTitle: current.eventTitle,
        label: current.label,
        ...current.context,
        minimumContracts: input.minimumContracts,
        maximumCost: input.maximumCost,
      },
      current.book,
      current.observedAt,
      opening.id,
    );
    return openingResponse(await pullOpening(userId, opening.id));
  });
}
