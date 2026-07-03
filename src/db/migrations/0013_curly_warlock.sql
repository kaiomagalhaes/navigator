-- transcript/summary are now encrypted at rest. Wipe existing plaintext rows so
-- the jsonb->text change has no data to cast; recordings are re-created
-- (encrypted) on the next Fathom sync/import.
DELETE FROM "fathom_recordings";
--> statement-breakpoint
ALTER TABLE "fathom_recordings" ALTER COLUMN "transcript" SET DATA TYPE text;