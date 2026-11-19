CREATE TABLE "position_share_drafts" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"reference" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"png" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_share_targets" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_position_shares" (
	"token" text PRIMARY KEY NOT NULL,
	"snapshot" jsonb NOT NULL,
	"png" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "share_drafts_owner_time_idx" ON "position_share_drafts" USING btree ("user_id","created_at");