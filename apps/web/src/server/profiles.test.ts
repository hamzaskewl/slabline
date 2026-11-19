import { test, expect } from "bun:test";
import { usernameSchema, profileSchema } from "@collectible/domain";
import { getDb, users, publicProfiles, eq } from "@collectible/db";
import {
  ownProfile,
  getPublicProfile,
  savePublicProfile,
  searchPublicProfiles,
} from "./profiles";
test("profile names normalize consistently and reject root route collisions and injected fields", () => {
  expect(usernameSchema.parse(" Hamza_1 ")).toBe("hamza_1");
  for (const name of [
    "api",
    "PORTFOLIO",
    "share",
    "wallet",
    "../secret",
    "a/b",
    "a",
    "1test",
  ])
    expect(usernameSchema.safeParse(name).success).toBe(false);
  expect(
    profileSchema.safeParse({
      username: "valid",
      displayName: "Name",
      bio: "",
      userId: "other",
    }).success,
  ).toBe(false);
});
test.skipIf(!process.env.DATABASE_URL)(
  "profiles are opt-in, owner-scoped, unique under races, and search returns public fields only",
  async () => {
    const db = getDb();
    const owners = await db
      .insert(users)
      .values([
        { privyId: `profile-test-${crypto.randomUUID()}` },
        { privyId: `profile-test-${crypto.randomUUID()}` },
      ])
      .returning();
    const [a, b] = owners;
    if (!a || !b) throw new Error("Missing test owners");
    const username = `qa_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    try {
      expect(await ownProfile(a.id)).toBeNull();
      const results = await Promise.allSettled(
        [a, b].map((o) =>
          savePublicProfile(o.id, {
            username,
            displayName: "Test name",
            bio: "A public bio",
          }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const winner = results[0]?.status === "fulfilled" ? a : b;
      const loser = winner.id === a.id ? b : a;
      expect(await ownProfile(loser.id)).toBeNull();
      await savePublicProfile(winner.id, {
        username,
        displayName: "Updated",
        bio: "",
      });
      expect(await getPublicProfile(username.toUpperCase())).toEqual({
        username,
        displayName: "Updated",
        bio: "",
      });
      expect(await searchPublicProfiles(username)).toEqual([
        { username, displayName: "Updated", bio: "" },
      ]);
      expect(await searchPublicProfiles("%_")).toEqual([]);
    } finally {
      for (const owner of owners) {
        await db
          .delete(publicProfiles)
          .where(eq(publicProfiles.userId, owner.id));
        await db.delete(users).where(eq(users.id, owner.id));
      }
    }
  },
);
