import "server-only";
import { db } from "@/db";
import { fathomRecordings, type GoogleAccount } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { getAuthedClient } from "@/lib/google";
import { fetchMeetingEvents } from "@/lib/google-calendar";
import { persistEvents } from "@/lib/events-store";
import {
  fetchTranscript,
  findMeetingForEvent,
  type FathomMeeting,
  type MatchableEvent,
} from "@/lib/fathom-meetings";

// Persist a matched Fathom recording for an event, pulling its transcript.
// Idempotent: re-linking upserts the row. Shared by the import auto-link and
// the manual "Sync with Fathom" action.
export async function linkFathomRecording(eventId: string, match: FathomMeeting): Promise<void> {
  const transcript = await fetchTranscript(match.recordingId);
  // Encrypt meeting content at rest; decrypted in the query layer on read.
  const encTranscript = encrypt(JSON.stringify(transcript));
  const encSummary = match.summary ? encrypt(match.summary) : null;
  await db
    .insert(fathomRecordings)
    .values({
      eventId,
      recordingId: match.recordingId,
      title: match.title,
      url: match.url,
      shareUrl: match.shareUrl,
      summary: encSummary,
      transcript: encTranscript,
      scheduledStartTime: match.scheduledStartTime,
    })
    .onConflictDoUpdate({
      target: fathomRecordings.eventId,
      set: {
        recordingId: match.recordingId,
        title: match.title,
        url: match.url,
        shareUrl: match.shareUrl,
        summary: encSummary,
        transcript: encTranscript,
        scheduledStartTime: match.scheduledStartTime,
        syncedAt: new Date(),
      },
    });
}

// Match each freshly-imported event to its Fathom recording with one search
// call per event, then upsert the confident matches. Best-effort per event: a
// Fathom error on one event is logged and skipped so the rest still link.
// Note: this makes one Fathom call per event (plus one per match for the
// transcript), so a large import can approach Fathom's 60 req/min limit.
async function linkImportedEvents(events: (MatchableEvent & { id: string })[]): Promise<number> {
  let linked = 0;
  for (const event of events) {
    try {
      const match = await findMeetingForEvent(event);
      if (!match) continue;
      await linkFathomRecording(event.id, match);
      linked++;
    } catch (err) {
      console.error("[importEvents:fathom]", event.id, err);
    }
  }
  return linked;
}

export type ImportSummary = { imported: number; people: number; linked: number };

// Import meetings from one account's calendar over [from, to] into
// calendar_events/persons, then auto-link each to its Fathom recording.
// Idempotent: re-importing the same window upserts rather than duplicating.
// Google/auth errors propagate to the caller; Fathom linking is best-effort.
export async function importCalendarRange(
  account: GoogleAccount,
  from: Date,
  to: Date
): Promise<ImportSummary> {
  const auth = await getAuthedClient(account);
  const events = await fetchMeetingEvents(auth, from, to);

  const stored = await persistEvents(account.id, events);
  const peopleSeen = new Set(stored.flatMap((e) => e.attendees.map((a) => a.email)));
  const savedEvents: (MatchableEvent & { id: string })[] = stored.map((event) => ({
    id: event.id,
    name: event.name,
    startsAt: event.startsAt,
    emails: [
      ...event.attendees.map((a) => a.email.toLowerCase()),
      ...(event.organizerEmail ? [event.organizerEmail.toLowerCase()] : []),
    ],
  }));

  // Best-effort: a Fathom outage or rate limit must not fail the import itself.
  const linked = await linkImportedEvents(savedEvents);

  return { imported: events.length, people: peopleSeen.size, linked };
}
