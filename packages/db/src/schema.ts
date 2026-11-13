import {
  pgTable,
  text,
  timestamp,
  jsonb,
  numeric,
  uuid,
  index,
  uniqueIndex,
  integer,
} from "drizzle-orm/pg-core";
const id = () => uuid("id").defaultRandom().primaryKey();
const created = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const amount = (name: string) => numeric(name, { precision: 24, scale: 6 });
export const users = pgTable("users", {
  id: id(),
  privyId: text("privy_id").notNull().unique(),
  createdAt: created(),
});
export const walletLinks = pgTable("wallet_links", {
  id: id(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  address: text("address").notNull().unique(),
  network: text("network").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
});
export const linkedGeminiAccounts = pgTable("linked_gemini_accounts", {
  id: id(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull()
    .unique(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  scopes: jsonb("scopes").notNull(),
  createdAt: created(),
});
export const markets = pgTable(
  "markets",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(),
    data: jsonb("data").notNull(),
    updatedAt: created(),
  },
  (t) => [index("markets_category_status_idx").on(t.category, t.status)],
);
export const contracts = pgTable("contracts", {
  symbol: text("symbol").primaryKey(),
  marketId: text("market_id")
    .references(() => markets.id)
    .notNull(),
  data: jsonb("data").notNull(),
});
export const marketSnapshots = pgTable(
  "market_snapshots",
  {
    id: id(),
    symbol: text("symbol").notNull(),
    data: jsonb("data").notNull(),
    createdAt: created(),
  },
  (t) => [index("snapshots_symbol_time_idx").on(t.symbol, t.createdAt)],
);
export const assets = pgTable("assets", {
  mint: text("mint").primaryKey(),
  network: text("network").notNull(),
  provider: text("provider").notNull(),
  data: jsonb("data").notNull(),
});
export const listings = pgTable(
  "listings",
  {
    id: text("id").primaryKey(),
    mint: text("mint").notNull(),
    status: text("status").notNull(),
    ask: amount("ask").notNull(),
    data: jsonb("data").notNull(),
    observedAt: created(),
  },
  (t) => [index("listing_status_mint_idx").on(t.status, t.mint)],
);
export const fmvValuations = pgTable(
  "fmv_valuations",
  {
    key: text("key").primaryKey(),
    providerId: text("provider_id").notNull(),
    data: jsonb("data").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("fmv_expiry_idx").on(t.expiresAt)],
);
export const comparableSales = pgTable("comparable_sales", {
  id: id(),
  valuationKey: text("valuation_key")
    .references(() => fmvValuations.key)
    .notNull(),
  amount: amount("amount").notNull(),
  soldAt: timestamp("sold_at", { withTimezone: true }).notNull(),
  url: text("url").notNull(),
});
export const entityAliases = pgTable("entity_aliases", {
  id: id(),
  entityId: text("entity_id").notNull(),
  alias: text("alias").notNull().unique(),
});
export const carts = pgTable("carts", {
  id: id(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  budget: amount("budget").notNull(),
  createdAt: created(),
});
export const cartItems = pgTable(
  "cart_items",
  {
    id: id(),
    cartId: uuid("cart_id")
      .references(() => carts.id)
      .notNull(),
    mint: text("mint").notNull(),
    ask: amount("ask").notNull(),
  },
  (t) => [uniqueIndex("cart_mint_unique").on(t.cartId, t.mint)],
);
export const fundingIntents = pgTable("funding_intents", {
  id: id(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  state: text("state").notNull(),
  amount: amount("amount").notNull(),
  version: integer("version").default(0).notNull(),
  data: jsonb("data").notNull(),
  createdAt: created(),
});
const operation = (name: string) =>
  pgTable(name, {
    id: id(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    providerId: text("provider_id").unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    state: text("state").notNull(),
    data: jsonb("data").notNull(),
    createdAt: created(),
  });
export const conversions = operation("conversions");
export const withdrawals = operation("withdrawals");
export const relayRequests = operation("relay_requests");
export const orders = operation("orders");
export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid("order_id")
      .references(() => orders.id)
      .notNull(),
    mint: text("mint").notNull(),
    state: text("state").notNull(),
    signature: text("signature").unique(),
    data: jsonb("data").notNull(),
  },
  (t) => [uniqueIndex("order_mint_unique").on(t.orderId, t.mint)],
);
export const positions = operation("positions");
export const settlements = operation("settlements");
export const onchainEvents = pgTable("onchain_events", {
  signature: text("signature").primaryKey(),
  network: text("network").notNull(),
  state: text("state").notNull(),
  data: jsonb("data").notNull(),
  createdAt: created(),
});
export const auditEvents = pgTable("audit_events", {
  id: id(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  data: jsonb("data").notNull(),
  createdAt: created(),
});
export const providerCache = pgTable("provider_cache", {
  key: text("key").primaryKey(),
  data: jsonb("data").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: created(),
});
export const walletChallenges = pgTable("wallet_challenges", {
  nonce: text("nonce").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  address: text("address").notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});
export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  encryptedTransaction: text("encrypted_transaction").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    nonce: text("nonce").primaryKey(),
    data: jsonb("data").notNull(),
    state: text("state").notNull().default("pending"),
    createdAt: created(),
  },
  (t) => [index("webhook_state_idx").on(t.state, t.createdAt)],
);
export const valuationJobs = pgTable(
  "valuation_jobs",
  {
    key: text("key").primaryKey(),
    listing: jsonb("listing").notNull(),
    state: text("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("valuation_job_due_idx").on(t.state, t.nextAttemptAt)],
);
