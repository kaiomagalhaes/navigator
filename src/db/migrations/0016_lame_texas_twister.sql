CREATE TABLE "worker_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"events_added" integer DEFAULT 0 NOT NULL,
	"fathom_linked" integer DEFAULT 0 NOT NULL,
	"days_updated" integer DEFAULT 0 NOT NULL,
	"error" text,
	"details" jsonb
);
--> statement-breakpoint
ALTER TABLE "fathom_recordings" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;