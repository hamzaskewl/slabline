CREATE TABLE "provider_budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"limit_credits" integer NOT NULL,
	"reserved_credits" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
