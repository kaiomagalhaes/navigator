"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, eventParticipants, fathomRecordings, googleAccounts, persons } from "@/db/schema";
import { getEvent } from "@/db/queries";
import { getAuthedClient } from "@/lib/google";
import { fetchMeetingEvents } from "@/lib/google-calendar";
import { FathomApiError } from "@/lib/fathom";
import {
  fetchMeetingsInWindow,
  fetchTranscript,
  pickBestMatch,
  type MatchableEvent,
} from "@/lib/fathom-meetings";

// Events, people, and participants are sourced exclusively from the Google
// Calendar import (see importEvents) — there is no manual create/edit path.
export type ImportState = { error?: string; imported?: number; people?: number };

// Turn a raw Google/Gaxios error into an actionable message. The failure mode
// matters: a disabled API is a Cloud-project config fix, not a reconnect.
function describeGoogleError(err: unknown): string {
  const e = err as {
    code?: number | string;
    response?: { status?: number; data?: { error?: { errors?: { reason?: string }[]; status?: string } } };
    errors?: { reason?: string }[];
  };
  const status = Number(e?.response?.status ?? e?.code);
  const reasons = new Set(
    [
      ...(e?.response?.data?.error?.errors ?? []),
      ...(e?.errors ?? []),
    ].map((x) => x?.reason)
  );
  const apiStatus = e?.response?.data?.error?.status;

  if (
    status === 403 &&
    (reasons.has("accessNotConfigured") || apiStatus === "PERMISSION_DENIED")
  ) {
    return "The Google Calendar API is disabled for this Google Cloud project. Enable it in the Google Cloud Console (APIs & Services → Library → Google Calendar API), wait a few minutes, then retry. Reconnecting the account will not help.";
  }
  if (status === 401 || reasons.has("invalid_grant") || apiStatus === "UNAUTHENTICATED") {
    return "Your Google connection has expired or was revoked. Disconnect and reconnect the account.";
  }
  return "Could not reach Google Calendar. Please try again in a moment.";
}

// Import meetings from a connected Google account into calendar_events/persons.
// Idempotent: re-importing the same window upserts events (by google_event_id)
// and people (by email) instead of duplicating them.
export async function importEvents(
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const accountId = String(formData.get("accountId") ?? "");
  const fromRaw = String(formData.get("from") ?? "");
  const toRaw = String(formData.get("to") ?? "");

  if (!accountId) return { error: "Choose a calendar to import from." };
  if (!fromRaw || !toRaw) return { error: "Pick a start and end date." };

  const from = new Date(`${fromRaw}T00:00:00`);
  const to = new Date(`${toRaw}T23:59:59`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { error: "Invalid date range." };
  }
  if (to < from) return { error: "End date must be on or after the start date." };

  const account = await db.query.googleAccounts.findFirst({
    where: eq(googleAccounts.id, accountId),
  });
  if (!account) return { error: "That calendar is no longer connected." };

  let events;
  try {
    const auth = await getAuthedClient(account);
    events = await fetchMeetingEvents(auth, from, to);
  } catch (err) {
    console.error("[importEvents]", err);
    return { error: describeGoogleError(err) };
  }

  const peopleSeen = new Set<string>();

  await db.transaction(async (tx) => {
    for (const event of events) {
      // Upsert attendees as persons (email is unique, lowercased).
      const personIds: string[] = [];
      for (const attendee of event.attendees) {
        peopleSeen.add(attendee.email);
        const [person] = await tx
          .insert(persons)
          .values({ name: attendee.name, email: attendee.email })
          .onConflictDoUpdate({
            target: persons.email,
            set: { name: attendee.name },
          })
          .returning({ id: persons.id });
        personIds.push(person.id);
      }

      // Upsert the event on (account_id, google_event_id).
      const [saved] = await tx
        .insert(calendarEvents)
        .values({
          name: event.name,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          accountId: account.id,
          googleEventId: event.googleEventId,
          organizerEmail: event.organizerEmail,
        })
        .onConflictDoUpdate({
          target: [calendarEvents.accountId, calendarEvents.googleEventId],
          set: {
            name: event.name,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            organizerEmail: event.organizerEmail,
          },
        })
        .returning({ id: calendarEvents.id });

      // Reconcile participants: replace the set so removed attendees drop off.
      await tx.delete(eventParticipants).where(eq(eventParticipants.eventId, saved.id));
      if (personIds.length > 0) {
        await tx
          .insert(eventParticipants)
          .values(personIds.map((personId) => ({ eventId: saved.id, personId })))
          .onConflictDoNothing();
      }
    }
  });

  revalidatePath("/events");
  revalidatePath("/people");
  revalidatePath("/calendars");
  return { imported: events.length, people: peopleSeen.size };
}

// ---- Fathom sync -----------------------------------------------------------

export type FathomSyncState = {
  error?: string;
  notFound?: boolean;
  linkedTitle?: string;
  url?: string | null;
};

// Fathom's API has no title/event-id filter, so we scan a ±12h window around
// the event start; the match is then made on scheduled time + title + attendees.
const FATHOM_WINDOW_MS = 12 * 60 * 60 * 1000;

function describeFathomError(err: unknown): string {
  if (err instanceof FathomApiError) {
    if (err.status === 401 || err.status === 403) {
      return "Fathom rejected the API key. Check FATHOM_API_KEY in your environment.";
    }
    if (err.status === 429) {
      return "Fathom rate limit reached (60 requests/minute). Please try again shortly.";
    }
  }
  return "Could not reach Fathom. Please try again in a moment.";
}

// Find the Fathom recording that corresponds to a calendar event and link it,
// storing the summary and transcript. Idempotent: re-syncing upserts the row.
export async function syncEventWithFathom(
  _prev: FathomSyncState,
  formData: FormData
): Promise<FathomSyncState> {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return { error: "Missing event." };

  const event = await getEvent(eventId);
  if (!event) return { error: "That event no longer exists." };

  const emails = [
    ...event.participants.map((p) => p.person.email.toLowerCase()),
    ...(event.organizerEmail ? [event.organizerEmail.toLowerCase()] : []),
  ];
  const matchable: MatchableEvent = { name: event.name, startsAt: event.startsAt, emails };

  let match;
  let transcript;
  try {
    const from = new Date(event.startsAt.getTime() - FATHOM_WINDOW_MS);
    const to = new Date(event.startsAt.getTime() + FATHOM_WINDOW_MS);
    const meetings = await fetchMeetingsInWindow(from, to);
    match = pickBestMatch(matchable, meetings);
    if (!match) {
      return { notFound: true };
    }
    transcript = await fetchTranscript(match.recordingId);
  } catch (err) {
    console.error("[syncEventWithFathom]", err);
    return { error: describeFathomError(err) };
  }

  await db
    .insert(fathomRecordings)
    .values({
      eventId: event.id,
      recordingId: match.recordingId,
      title: match.title,
      url: match.url,
      shareUrl: match.shareUrl,
      summary: match.summary,
      transcript,
      scheduledStartTime: match.scheduledStartTime,
    })
    .onConflictDoUpdate({
      target: fathomRecordings.eventId,
      set: {
        recordingId: match.recordingId,
        title: match.title,
        url: match.url,
        shareUrl: match.shareUrl,
        summary: match.summary,
        transcript,
        scheduledStartTime: match.scheduledStartTime,
        syncedAt: new Date(),
      },
    });

  revalidatePath(`/events/${event.id}`);
  return { linkedTitle: match.title ?? "Fathom recording", url: match.shareUrl ?? match.url };
}

export async function disconnectAccount(formData: FormData): Promise<void> {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return;
  await db.delete(googleAccounts).where(eq(googleAccounts.id, accountId));
  revalidatePath("/calendars");
}
