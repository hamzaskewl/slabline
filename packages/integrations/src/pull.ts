import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  and,
  eq,
  fundingIntents,
  getDb,
  pullOpenings,
  sql,
} from "@collectible/db";
import {
  money,
  pullOutcome,
  units,
  type PullOpening,
  type PullProof,
  type PullRandomnessSource,
  type PullTheme,
  type PullTier,
} from "@collectible/domain";
import { DemoError, lockedDemoAccount } from "./demo";

type Row = typeof pullOpenings.$inferSelect;
type OpeningData = Pick<
  PullOpening,
  "multiplier" | "randomnessSource" | "proof" | "redemption" | "payer" | "theme"
> & {
  version: 1;
  price: string;
  programId?: string | null;
  submissionExpiry?: string;
};

export type PullRandomnessConfig =
  | { source: "demo-csprng" }
  | { source: "magicblock-devnet"; payer: string; programId: string };

function view(row: Row): PullOpening {
  const data = row.data as OpeningData;
  return {
    id: row.id,
    version: data.version,
    price: data.price,
    tier: row.tier as PullTier,
    state: row.state as PullOpening["state"],
    requestSignature: row.requestSignature,
    budget: row.budget,
    multiplier: data.multiplier,
    randomnessSource: data.randomnessSource,
    proof: data.proof,
    createdAt: row.createdAt.toISOString(),
    positionId: row.positionId,
    redemption: data.redemption,
    payer: data.payer,
    programId: data.programId ?? null,
    theme: data.theme,
  };
}

export function pullRandomnessMode(): PullRandomnessSource {
  const mode = process.env.PULL_RANDOMNESS ?? "demo-csprng";
  if (mode !== "demo-csprng" && mode !== "magicblock-devnet")
    throw new DemoError("Pull & Predict randomness is unavailable.", 503);
  return mode;
}

function ownerOpening(userId: string, id: string) {
  return and(eq(pullOpenings.userId, userId), eq(pullOpenings.id, id));
}

async function rowFor(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(pullOpenings)
    .where(ownerOpening(userId, id));
  if (!row) throw new DemoError("Pack opening not found.", 404);
  return row;
}

export async function pullOpening(userId: string, id: string) {
  return view(await rowFor(userId, id));
}

export async function pullOpeningByKey(userId: string, key: string) {
  const [row] = await getDb()
    .select()
    .from(pullOpenings)
    .where(
      and(eq(pullOpenings.userId, userId), eq(pullOpenings.clientKey, key)),
    );
  return row ? view(row) : null;
}

export async function pullPendingRequest(userId: string, id: string) {
  const row = await rowFor(userId, id);
  const opening = view(row);
  if (
    opening.state !== "pending" ||
    !row.seedHex ||
    !opening.payer ||
    !opening.programId
  )
    throw new DemoError("This pack has no pending onchain request.", 409);
  return {
    opening,
    seedHex: row.seedHex,
    payer: opening.payer,
    programId: opening.programId,
  };
}

export async function pullAccount(userId: string) {
  return getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
    const openings = await tx
      .select()
      .from(pullOpenings)
      .where(eq(pullOpenings.userId, userId))
      .orderBy(sql`${pullOpenings.createdAt} desc`);
    return {
      balance: account.amount,
      openings: openings.filter((row) => row.state !== "cancelled").map(view),
    };
  });
}

export function pullAward(tier: PullTier, bucket: number) {
  const { multiplier, multiplierBps } = pullOutcome(bucket);
  const budget = money((units(String(tier)) * BigInt(multiplierBps)) / 10000n);
  return { budget, multiplier };
}

export async function pullBalance(userId: string) {
  return getDb().transaction(
    async (tx) => (await lockedDemoAccount(tx, userId)).amount,
  );
}

export function fulfilledPullBucket(randomnessHex: string) {
  if (!/^[0-9a-f]{64}$/i.test(randomnessHex))
    throw new Error("Invalid fulfilled MagicBlock randomness bytes.");
  const randomness = Buffer.from(randomnessHex, "hex");
  // A uint16 has 65,536 values. Accept only the first 60,000 so all
  // 10,000 buckets have exactly six preimages per attempt.
  for (let counter = 0; ; counter++) {
    const bytes = counter
      ? createHash("sha256")
          .update("slabline:pull:v1:")
          .update(String(counter))
          .update(":")
          .update(randomness)
          .digest()
      : randomness;
    for (let offset = 0; offset < bytes.length; offset += 2) {
      const candidate = bytes.readUInt16BE(offset);
      if (candidate < 60000) return candidate % 10000;
    }
  }
}

export async function openPull(
  userId: string,
  key: string,
  tier: PullTier,
  randomness: PullRandomnessConfig,
  theme: PullTheme,
) {
  const onchain = randomness.source === "magicblock-devnet";
  const payer = onchain ? randomness.payer : null;
  return getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
    const [existing] = await tx
      .select()
      .from(pullOpenings)
      .where(
        and(eq(pullOpenings.userId, userId), eq(pullOpenings.clientKey, key)),
      );
    if (existing) {
      assertPullRetry(view(existing), tier, payer, theme);
      return view(existing);
    }
    const price = units(String(tier));
    if (units(account.amount) < price)
      throw new DemoError("Insufficient Demo USD for this pack.", 409);
    const award = onchain ? null : pullAward(tier, randomInt(10000));
    const data: OpeningData = {
      version: 1,
      price: money(price),
      multiplier: award?.multiplier ?? null,
      randomnessSource: randomness.source,
      payer,
      programId: onchain ? randomness.programId : null,
      theme,
      proof: null,
      redemption: null,
    };
    const [opening] = await tx
      .insert(pullOpenings)
      .values({
        userId,
        clientKey: key,
        tier,
        state: onchain ? "pending" : "ready",
        seedHex: onchain ? randomBytes(32).toString("hex") : null,
        budget: award?.budget ?? null,
        data,
      })
      .returning();
    await tx
      .update(fundingIntents)
      .set({
        amount: money(units(account.amount) - price),
        version: account.version + 1,
      })
      .where(eq(fundingIntents.id, account.id));
    return view(opening!);
  });
}

export function assertPullRetry(
  opening: PullOpening,
  tier: PullTier,
  payer: string | null,
  theme: PullTheme,
) {
  if (opening.state === "cancelled")
    throw new DemoError("This opening was cancelled. Choose a new pack.", 409);
  if (
    opening.tier !== tier ||
    opening.payer !== payer ||
    opening.theme.kind !== theme.kind ||
    (opening.theme.kind !== "all" &&
      theme.kind !== "all" &&
      opening.theme.label !== theme.label)
  )
    throw new DemoError(
      "This purchase key was already used for another pack.",
      409,
    );
}
/** Reserve the signed request before broadcasting. Cancellation uses the same
 * account lock so an abandoned opening can never subsequently be submitted. */
export async function submitPullRequest(
  userId: string,
  id: string,
  signature: string,
  submissionExpiry?: string,
) {
  return getDb().transaction(async (tx) => {
    await lockedDemoAccount(tx, userId);
    const [row] = await tx
      .select()
      .from(pullOpenings)
      .where(ownerOpening(userId, id))
      .for("update");
    if (!row) throw new DemoError("Pack opening not found.", 404);
    if (row.state === "cancelled")
      throw new DemoError(
        "This opening was cancelled. Choose a new pack.",
        409,
      );
    if (row.state !== "pending") {
      if (row.requestSignature === signature) return view(row);
      throw new DemoError("This pack has already been opened.", 409);
    }
    if (row.requestSignature && row.requestSignature !== signature)
      throw new DemoError(
        "This pack already has a submitted transaction.",
        409,
      );
    const [updated] = await tx
      .update(pullOpenings)
      .set({
        requestSignature: signature,
        data: {
          ...(row.data as OpeningData),
          ...(submissionExpiry ? { submissionExpiry } : {}),
        },
      })
      .where(ownerOpening(userId, id))
      .returning();
    return view(updated!);
  });
}
export async function pullSubmissionExpiry(userId: string, id: string) {
  return ((await rowFor(userId, id)).data as OpeningData).submissionExpiry;
}
/** Called only after the API proves this exact signature failed or expired. */
export async function clearFailedPullRequest(
  userId: string,
  id: string,
  signature: string,
) {
  return getDb().transaction(async (tx) => {
    await lockedDemoAccount(tx, userId);
    const [row] = await tx
      .select()
      .from(pullOpenings)
      .where(ownerOpening(userId, id))
      .for("update");
    if (!row) throw new DemoError("Pack opening not found.", 404);
    if (row.state !== "pending" || row.requestSignature !== signature)
      return view(row);
    const [updated] = await tx
      .update(pullOpenings)
      .set({ requestSignature: null })
      .where(ownerOpening(userId, id))
      .returning();
    return view(updated!);
  });
}
/** Only an unsigned draft can release its reserved demo cash. Submitted or
 * fulfilled openings stay recoverable, including ambiguous network failures. */
export async function cancelPull(userId: string, id: string) {
  return getDb().transaction(async (tx) => {
    const account = await lockedDemoAccount(tx, userId);
    const [row] = await tx
      .select()
      .from(pullOpenings)
      .where(ownerOpening(userId, id))
      .for("update");
    if (!row) throw new DemoError("Pack opening not found.", 404);
    if (row.state !== "pending" || row.requestSignature) return view(row);
    const [updated] = await tx
      .update(pullOpenings)
      .set({ state: "cancelled" })
      .where(ownerOpening(userId, id))
      .returning();
    await tx
      .update(fundingIntents)
      .set({
        amount: money(
          units(account.amount) + units((row.data as OpeningData).price),
        ),
        version: account.version + 1,
      })
      .where(eq(fundingIntents.id, account.id));
    return view(updated!);
  });
}

export async function fulfillPull(
  userId: string,
  id: string,
  proof: PullProof,
) {
  return getDb().transaction(async (tx) => {
    await lockedDemoAccount(tx, userId);
    const [row] = await tx
      .select()
      .from(pullOpenings)
      .where(ownerOpening(userId, id))
      .for("update");
    if (!row) throw new DemoError("Pack opening not found.", 404);
    const data = row.data as OpeningData;
    if (
      data.randomnessSource !== "magicblock-devnet" ||
      row.seedHex !== proof.seedHex ||
      data.programId !== proof.programId
    )
      throw new DemoError("Randomness proof does not match this pack.", 409);
    if (row.state !== "pending") {
      if (row.requestSignature !== proof.requestSignature)
        throw new DemoError("This pack already has a different proof.", 409);
      return view(row);
    }
    const award = pullAward(
      row.tier as PullTier,
      fulfilledPullBucket(proof.randomnessHex),
    );
    const [updated] = await tx
      .update(pullOpenings)
      .set({
        state: "ready",
        budget: award.budget,
        requestSignature: proof.requestSignature,
        data: { ...data, multiplier: award.multiplier, proof },
      })
      .where(ownerOpening(userId, id))
      .returning();
    return view(updated!);
  });
}
