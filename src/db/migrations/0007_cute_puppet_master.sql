ALTER TABLE "calendar_events" ADD COLUMN "is_all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "location" text;