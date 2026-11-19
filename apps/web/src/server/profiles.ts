import { getDb, publicProfiles, eq, sql } from "@collectible/db";
import {
  profileSchema,
  usernameSchema,
  type PublicProfile,
} from "@collectible/domain";
import { ApiError } from "./auth";
const fields = {
  username: publicProfiles.username,
  displayName: publicProfiles.displayName,
  bio: publicProfiles.bio,
};
export async function getPublicProfile(username: string) {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return null;
  const [profile] = await getDb()
    .select(fields)
    .from(publicProfiles)
    .where(eq(publicProfiles.username, parsed.data))
    .limit(1);
  return profile ?? null;
}
export async function searchPublicProfiles(query: string) {
  const q = query.trim().toLowerCase().slice(0, 100);
  // Literal substring matching keeps SQL wildcard input from enumerating matches.
  return getDb()
    .select(fields)
    .from(publicProfiles)
    .where(
      sql`position(${q} in ${publicProfiles.username}) > 0 or position(${q} in lower(${publicProfiles.displayName})) > 0`,
    )
    .orderBy(
      sql`case when ${publicProfiles.username} = ${q} then 0 when starts_with(${publicProfiles.username}, ${q}) then 1 else 2 end`,
      publicProfiles.username,
    )
    .limit(6);
}
export async function ownProfile(userId: string) {
  const [profile] = await getDb()
    .select(fields)
    .from(publicProfiles)
    .where(eq(publicProfiles.userId, userId))
    .limit(1);
  return profile ?? null;
}
export async function savePublicProfile(
  userId: string,
  body: unknown,
): Promise<PublicProfile> {
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      400,
      parsed.error.issues[0]?.message ?? "Invalid profile.",
    );
  try {
    const [profile] = await getDb()
      .insert(publicProfiles)
      .values({ userId, ...parsed.data })
      .onConflictDoUpdate({
        target: publicProfiles.userId,
        set: { ...parsed.data, updatedAt: new Date() },
      })
      .returning(fields);
    if (!profile) throw new Error("Profile was not saved.");
    return profile;
  } catch (error) {
    const cause = error as { cause?: { code?: string }; code?: string };
    if (cause.code === "23505" || cause.cause?.code === "23505")
      throw new ApiError(
        409,
        "That username is already taken. Choose another.",
      );
    throw error;
  }
}
