CREATE TABLE "pull_openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_key" uuid NOT NULL,
	"tier" integer NOT NULL,
	"state" text NOT NULL,
	"seed_hex" text,
	"request_signature" text,
	"budget" numeric(24, 6),
	"position_id" uuid,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pull_openings_seed_hex_unique" UNIQUE("seed_hex"),
	CONSTRAINT "pull_openings_request_signature_unique" UNIQUE("request_signature")
);
--> statement-breakpoint
ALTER TABLE "pull_openings" ADD CONSTRAINT "pull_openings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_openings" ADD CONSTRAINT "pull_openings_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pull_openings_owner_key_idx" ON "pull_openings" USING btree ("user_id","client_key");--> statement-breakpoint
CREATE INDEX "pull_openings_owner_time_idx" ON "pull_openings" USING btree ("user_id","created_at");