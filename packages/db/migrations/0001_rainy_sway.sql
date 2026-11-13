CREATE TABLE "oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_transaction" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"nonce" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_state_idx" ON "webhook_deliveries" USING btree ("state","created_at");