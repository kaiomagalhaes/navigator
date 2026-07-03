CREATE TABLE "series_prep_settings" (
	"recurring_event_id" text PRIMARY KEY NOT NULL,
	"skip_prep" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
