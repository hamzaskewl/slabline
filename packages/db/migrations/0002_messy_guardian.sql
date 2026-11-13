CREATE TABLE "valuation_jobs" (
	"key" text PRIMARY KEY NOT NULL,
	"listing" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "valuation_job_due_idx" ON "valuation_jobs" USING btree ("state","next_attempt_at");