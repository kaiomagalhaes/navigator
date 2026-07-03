CREATE TABLE "day_syncs" (
	"date" text PRIMARY KEY NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
