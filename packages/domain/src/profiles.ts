import { z } from "zod";
// Root-level routes and service paths cannot be claimed as public usernames.
export const reservedUsernames = new Set([
  "about",
  "api",
  "admin",
  "assets",
  "auth",
  "brand",
  "cart",
  "collection",
  "demo",
  "devnet",
  "favicon",
  "fonts",
  "health",
  "icons",
  "login",
  "logout",
  "markets",
  "portfolio",
  "profile",
  "profiles",
  "redeem",
  "rewards",
  "robots",
  "search",
  "settings",
  "share",
  "signin",
  "signup",
  "sitemap",
  "support",
  "wallet",
  "www",
  "slabline",
]);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(24)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Use letters, numbers and underscores, starting with a letter.",
  )
  .refine((name) => !reservedUsernames.has(name), "This username is reserved.");
export const profileSchema = z
  .object({
    username: usernameSchema,
    displayName: z.string().trim().min(1).max(50),
    bio: z.string().trim().max(240),
  })
  .strict();
export type PublicProfile = z.infer<typeof profileSchema>;
