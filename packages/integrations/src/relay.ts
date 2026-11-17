import { address } from "@solana/kit";
import { z } from "zod";
import {
  IntegrationBlocked,
  relayRoutes,
  relayQuoteInput,
  relayAmount,
  relayFormat,
  type RelayQuoteInput,
  type RelayQuote,
  type RelayFee,
  type RelayStatus,
} from "@collectible/domain";

const bases = {
  mainnet: "https://api.relay.link",
  testnet: "https://api.testnets.relay.link",
} as const;
const integer = z.string().max(78).regex(/^\d+$/);
const currency = z.object({
  chainId: z.number().int().positive(),
  address: z.string().max(64),
  symbol: z.string().max(20),
  decimals: z.number().int().min(0).max(18),
});
const quantity = z.object({
  currency,
  amount: integer,
  minimumAmount: integer.optional(),
});
const fee = z.object({
  currency,
  amount: z
    .string()
    .max(79)
    .regex(/^-?\d+$/),
  amountUsd: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .optional(),
});
const requestId = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const quoteSchema = z.object({
  requestId: requestId.optional(),
  steps: z
    .array(
      z.object({
        id: z.enum(["approve", "approval", "deposit"]),
        kind: z.literal("transaction"),
        requestId: requestId.optional(),
        depositAddress: z.union([z.literal(""), z.null()]).optional(),
        depositAddressId: z.union([z.literal(""), z.null()]).optional(),
        items: z
          .array(
            z.object({
              data: z.object({
                from: z.string(),
                to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
                chainId: z.number().int(),
                value: integer,
                data: z
                  .string()
                  .max(100000)
                  .regex(/^0x([0-9a-fA-F]{2})*$/),
              }),
            }),
          )
          .min(1)
          .max(5),
      }),
    )
    .min(1)
    .max(3),
  fees: z.object({
    gas: fee,
    relayer: fee,
    relayerGas: fee.optional(),
    relayerService: fee.optional(),
    app: fee.optional(),
    subsidized: fee.optional(),
  }),
  feeSponsorship: z.null().optional(),
  details: z.object({
    sender: z.string(),
    recipient: z.string(),
    currencyIn: quantity,
    currencyOut: quantity,
    userBalance: integer.optional(),
    timeEstimate: z.number().finite().min(0).max(86400),
  }),
});
export class RelayError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
function apiError(status: number, body: unknown): RelayError {
  const code = z
    .object({
      errorCode: z
        .string()
        .regex(/^[A-Z0-9_]+$/)
        .max(80)
        .optional(),
    })
    .safeParse(body);
  const providerCode = code.success ? code.data.errorCode : undefined;
  if (status === 401 || status === 403)
    return new RelayError(
      "RELAY_ACCESS_REQUIRED",
      "Relay API access is not configured or permitted for this route.",
    );
  if (providerCode === "BLOCKED_WALLET_ADDRESS")
    return new RelayError(
      providerCode,
      "Relay cannot offer this route for the selected wallet.",
      400,
    );
  if (status === 429)
    return new RelayError(
      "RELAY_RATE_LIMIT",
      "Relay is busy. Wait a minute before requesting another quote.",
      429,
    );
  if (status === 400)
    return new RelayError(
      providerCode ?? "RELAY_NO_ROUTE",
      "Relay could not quote this route and amount. Try another amount or use a manual transfer.",
      400,
    );
  return new RelayError(
    "RELAY_UNAVAILABLE",
    "Relay is unavailable. Your wallet has not been charged.",
  );
}
async function read(
  base: string,
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
) {
  const key = process.env.RELAY_API_KEY;
  let response: Response;
  try {
    response = await fetcher(`${base}${path}`, {
      ...init,
      redirect: "error",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "x-api-key": key } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new RelayError(
      "RELAY_TIMEOUT",
      "Relay did not respond. Retry the quote; no transaction was submitted.",
    );
  }
  const text = await response.text();
  if (text.length > 500000)
    throw new RelayError(
      "RELAY_RESPONSE_INVALID",
      "Relay returned an unsupported response.",
    );
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new RelayError(
      "RELAY_RESPONSE_INVALID",
      "Relay returned an unsupported response.",
    );
  }
  if (!response.ok) throw apiError(response.status, body);
  return body;
}
export function assertRelayExecutionDisabled(): never {
  throw new IntegrationBlocked(
    "Relay",
    "Bridge execution is disabled. A fresh permitted quote, full transaction inspection and an explicit user-signed source transaction are required before release.",
  );
}
export const relayAdapter = {
  quote: quoteRelay,
  status: relayStatus,
  async execute(_approval: unknown): Promise<{ requestId: string }> {
    return assertRelayExecutionDisabled();
  },
};
export async function relayCapabilities(fetcher: typeof fetch = fetch) {
  return await Promise.all(
    Object.entries(bases).map(async ([environment, base]) => {
      try {
        const body = z
          .object({
            chains: z.array(
              z.object({
                id: z.number(),
                disabled: z.boolean().optional(),
                depositEnabled: z.boolean().optional(),
                solverCurrencies: z
                  .array(currency.omit({ chainId: true }))
                  .optional(),
              }),
            ),
          })
          .parse(await read(base, "/chains", { method: "GET" }, fetcher));
        return {
          environment,
          routes: Object.entries(relayRoutes)
            .filter(([, route]) => route.environment === environment)
            .map(([id, route]) => {
              const origin = body.chains.find(
                  (c) => c.id === route.originChainId,
                ),
                destination = body.chains.find(
                  (c) => c.id === route.destinationChainId,
                );
              const supports = (chain: typeof origin, token: string) =>
                !!chain &&
                chain.disabled === false &&
                chain.depositEnabled === true &&
                !!chain.solverCurrencies?.some(
                  (c) =>
                    c.address.toLowerCase() === token.toLowerCase() &&
                    c.decimals === route.decimals,
                );
              return {
                id,
                available:
                  supports(origin, route.originCurrency) &&
                  supports(destination, route.destinationCurrency),
                keyConfigured:
                  environment === "testnet" || !!process.env.RELAY_API_KEY,
              };
            }),
          error: null,
        };
      } catch {
        return {
          environment,
          routes: [],
          error: "Relay route discovery is temporarily unavailable.",
        };
      }
    }),
  );
}
export async function quoteRelay(
  raw: RelayQuoteInput,
  fetcher: typeof fetch = fetch,
): Promise<RelayQuote> {
  const input = relayQuoteInput.parse(raw),
    route = relayRoutes[input.routeId],
    amount = relayAmount(input);
  if (route.destinationNetwork === "solana") address(input.recipient);
  else if (input.recipient.toLowerCase() !== input.wallet)
    throw new RelayError(
      "RELAY_OWNED_WALLET_REQUIRED",
      "Testnet output must return to the same verified EVM wallet.",
      400,
    );
  if (route.environment === "mainnet" && !process.env.RELAY_API_KEY)
    throw new RelayError(
      "RELAY_KEY_MISSING",
      "Relay API key is not configured. Testnet quote previews remain available.",
    );
  const started = Date.now();
  const body = await read(
    bases[route.environment],
    "/quote/v2",
    {
      method: "POST",
      body: JSON.stringify({
        user: input.wallet,
        recipient: input.recipient,
        originChainId: route.originChainId,
        destinationChainId: route.destinationChainId,
        originCurrency: route.originCurrency,
        destinationCurrency: route.destinationCurrency,
        amount,
        tradeType: "EXACT_INPUT",
        slippageTolerance: "50",
        refundTo: input.wallet,
        usePermit: false,
        useDepositAddress: false,
        explicitDeposit: true,
        subsidizeFees: false,
        subsidizeRent: false,
        topupGas: false,
      }),
    },
    fetcher,
  );
  try {
    const q = quoteSchema.parse(body);
    const same = (a: string, b: string, evm: boolean) =>
      evm ? a.toLowerCase() === b.toLowerCase() : a === b;
    const matches = (
      c: z.infer<typeof currency>,
      chain: number,
      token: string,
    ) =>
      c.chainId === chain &&
      same(c.address, token, chain !== 792703809) &&
      c.decimals === route.decimals;
    if (
      q.details.sender.toLowerCase() !== input.wallet ||
      !same(
        q.details.recipient,
        input.recipient,
        route.destinationNetwork === "eip155",
      ) ||
      !matches(
        q.details.currencyIn.currency,
        route.originChainId,
        route.originCurrency,
      ) ||
      !matches(
        q.details.currencyOut.currency,
        route.destinationChainId,
        route.destinationCurrency,
      ) ||
      q.details.currencyIn.amount !== amount
    )
      throw new Error("Route mismatch");
    const out = BigInt(q.details.currencyOut.amount),
      minimum = BigInt(q.details.currencyOut.minimumAmount ?? "0");
    if (
      out <= 0n ||
      minimum <= 0n ||
      minimum > out ||
      minimum < (out * 9950n) / 10000n
    )
      throw new Error("Invalid output or slippage");
    if (
      BigInt(q.fees.gas.amount) < 0n ||
      BigInt(q.fees.relayer.amount) < 0n ||
      BigInt(q.fees.subsidized?.amount ?? "0") !== 0n ||
      BigInt(q.fees.app?.amount ?? "0") !== 0n
    )
      throw new Error("Unexpected fees or sponsorship");
    if (
      q.fees.gas.currency.chainId !== route.originChainId ||
      q.fees.gas.currency.address.toLowerCase() !==
        "0x0000000000000000000000000000000000000000" ||
      q.fees.gas.currency.decimals !== 18
    )
      throw new Error("Unexpected origin gas currency");
    for (const f of [
      q.fees.relayer,
      q.fees.relayerGas,
      q.fees.relayerService,
      q.fees.app,
      q.fees.subsidized,
    ])
      if (f && !matches(f.currency, route.originChainId, route.originCurrency))
        throw new Error("Unexpected route fee currency");
    const deposit = q.steps.filter((s) => s.id === "deposit");
    if (deposit.length !== 1) throw new Error("Missing deposit step");
    const id = requestId.parse(q.requestId ?? deposit[0]!.requestId);
    for (const step of q.steps) {
      if (step.requestId && step.requestId !== id)
        throw new Error("Request mismatch");
      for (const item of step.items)
        if (
          item.data.from.toLowerCase() !== input.wallet ||
          item.data.chainId !== route.originChainId ||
          BigInt(item.data.value) >
            (route.environment === "testnet" ? BigInt(amount) : 0n)
        )
          throw new Error("Unexpected source transaction");
    }
    const normalize = (f: z.infer<typeof fee>): RelayFee => ({
      amount: f.amount,
      formatted: relayFormat(f.amount, f.currency.decimals),
      symbol: f.currency.symbol,
      chainId: f.currency.chainId,
      currency: f.currency.address,
      decimals: f.currency.decimals,
      usd: f.amountUsd ?? null,
    });
    const balance =
        q.details.userBalance === undefined
          ? null
          : BigInt(q.details.userBalance),
      enough = balance === null ? null : balance >= BigInt(amount);
    return {
      source: "relay",
      input,
      environment: route.environment,
      requestId: id,
      amountIn: amount,
      amountOut: out.toString(),
      minimumOut: minimum.toString(),
      fees: {
        originGas: normalize(q.fees.gas),
        relayer: normalize(q.fees.relayer),
        destinationGas: q.fees.relayerGas ? normalize(q.fees.relayerGas) : null,
        service: q.fees.relayerService
          ? normalize(q.fees.relayerService)
          : null,
        app: q.fees.app ? normalize(q.fees.app) : null,
      },
      sourceBalance: balance?.toString() ?? null,
      sourceBalanceAfterPrincipal: enough
        ? (balance! - BigInt(amount)).toString()
        : null,
      sufficientPrincipal: enough,
      timeEstimateSeconds: q.details.timeEstimate,
      steps: q.steps.map((s) => (s.id === "deposit" ? "deposit" : "approval")),
      quotedAt: new Date(started).toISOString(),
      expiresAt: new Date(started + 30000).toISOString(),
      canExecute: false,
      gasSponsorship: false,
    };
  } catch {
    throw new RelayError(
      "RELAY_RESPONSE_INVALID",
      "Relay returned an unsupported route, fee or transaction. No transaction was submitted.",
    );
  }
}
export async function relayStatus(
  quote: RelayQuote,
  fetcher: typeof fetch = fetch,
): Promise<RelayStatus> {
  const id = requestId.parse(quote.requestId),
    route = relayRoutes[quote.input.routeId];
  const body = await read(
    bases[route.environment],
    `/intents/status/v3?requestId=${id}`,
    { method: "GET" },
    fetcher,
  );
  const result = z
    .object({
      status: z.enum([
        "waiting",
        "depositing",
        "pending",
        "submitted",
        "success",
        "failure",
        "refund",
      ]),
      inTxHashes: z
        .array(z.string().regex(/^0x[0-9a-fA-F]{64}$/))
        .max(20)
        .default([]),
      txHashes: z
        .array(
          z
            .string()
            .regex(
              route.destinationNetwork === "solana"
                ? /^[1-9A-HJ-NP-Za-km-z]{64,88}$/
                : /^0x[0-9a-fA-F]{64}$/,
            ),
        )
        .max(20)
        .default([]),
      originChainId: z.number().optional(),
      destinationChainId: z.number().optional(),
    })
    .safeParse(body);
  if (
    !result.success ||
    (result.data.originChainId !== undefined &&
      result.data.originChainId !== route.originChainId) ||
    (result.data.destinationChainId !== undefined &&
      result.data.destinationChainId !== route.destinationChainId)
  )
    throw new RelayError(
      "RELAY_STATUS_INVALID",
      "Relay status could not be verified.",
    );
  return {
    providerState: result.data.status,
    originHashes: result.data.inTxHashes,
    destinationHashes: result.data.txHashes,
    checkedAt: new Date().toISOString(),
    independentlyConfirmed: false,
  };
}
