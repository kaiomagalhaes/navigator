CREATE TABLE "fathom_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"recording_id" text NOT NULL,
	"title" text,
	"url" text,
	"share_url" text,
	"summary" text,
	"transcript" jsonb,
	"scheduled_start_time" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fathom_recordings_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "fathom_recordings" ADD CONSTRAINT "fathom_recordings_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;