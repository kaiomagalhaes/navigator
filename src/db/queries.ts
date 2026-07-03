import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "./index";
import {
  calendarEvents,
  daySyncs,
  eventParticipants,
  googleAccounts,
  persons,
  seriesPrepSettings,
  todos,
} from "./schema";
import { decrypt } from "@/lib/crypto";
import type { FathomTranscriptEntry } from "@/lib/fathom-meetings";

// `summary` and `transcript` are stored encrypted (see src/lib/import-events.ts).
// Decrypt them here so every consumer of a loaded recording sees plaintext — the
// summary string and the parsed transcript array — just as before encryption.
type EncryptedRecording = { summary: string | null; transcript: string | null };

function decryptRecording<T extends EncryptedRecording>(
  rec: T | null
):
  | (Omit<T, "summary" | "transcript"> & {
      summary: string | null;
      transcript: FathomTranscriptEntry[] | null;
    })
  | null {
  if (!rec) return null;
  return {
    ...rec,
    summary: rec.summary ? decrypt(rec.summary) : null,
    transcript: rec.transcript
      ? (JSON.parse(decrypt(rec.transcript)) as FathomTranscriptEntry[])
      : null,
  };
}

function withDecryptedRecording<E extends { fathomRecording: EncryptedRecording | null }>(
  event: E
) {
  return { ...event, fathomRecording: decryptRecording(event.fathomRecording) };
}

// Connected Google accounts, without exposing stored tokens to callers/UI.
export async function listGoogleAccounts() {
  return db.query.googleAccounts.findMany({
    orderBy: [asc(googleAccounts.createdAt)],
    columns: { id: true, email: true, createdAt: true },
  });
}

export async function listEvents() {
  const rows = await db.query.calendarEvents.findMany({
    // Newest first (most recent / upcoming events at the top).
    orderBy: [desc(calendarEvents.startsAt)],
    with: {
      participants: { with: { person: true } },
      fathomRecording: true,
    },
  });
  return rows.map(withDecryptedRecording);
}

// Stored events that start within [from, to), earliest first, with attendees.
// Powers the home page's day view: it reads these first and only falls back to
// pulling from Google when this comes back empty for the chosen day.
export async function listEventsForDay(from: Date, to: Date) {
  return db.query.calendarEvents.findMany({
    where: and(gte(calendarEvents.startsAt, from), lt(calendarEvents.startsAt, to)),
    orderBy: [asc(calendarEvents.startsAt)],
    with: {
      participants: { with: { person: true } },
    },
  });
}

// The set of recurring-series ids the user has marked "skip prep". Batch prep
// (auto-prep + "Prep N meetings") ignores occurrences of these series.
export async function listSkippedSeriesIds(): Promise<Set<string>> {
  const rows = await db.query.seriesPrepSettings.findMany({
    where: eq(seriesPrepSettings.skipPrep, true),
    columns: { recurringEventId: true },
  });
  return new Set(rows.map((r) => r.recurringEventId));
}

// Whether a given recurring series is marked "skip prep".
export async function isSeriesSkipped(recurringEventId: string): Promise<boolean> {
  const row = await db.query.seriesPrepSettings.findFirst({
    where: eq(seriesPrepSettings.recurringEventId, recurringEventId),
    columns: { skipPrep: true },
  });
  return row?.skipPrep ?? false;
}

// The last time a given day (local "YYYY-MM-DD") was synced from Google, or
// null if it has never been synced. Powers the home page's "Last updated at".
export async function getDaySync(date: string) {
  return db.query.daySyncs.findFirst({ where: eq(daySyncs.date, date) });
}

// The most recent past meetings a given person took part in, newest first,
// excluding one event (the one you're currently viewing). Used on the event
// page to show "the last few times we met with each attendee".
//
// When `series` is given, results are restricted to prior occurrences of that
// recurring meeting — so preparing a recurring meeting only pulls from its own
// sequence, not every meeting with the person. A candidate matches by
// recurring-series id OR by identical name: occurrences share both, and the
// name fallback covers older occurrences stored before we tracked the series id
// (or otherwise untagged), which would otherwise be missed.
export async function listRecentMeetingsWithPerson(
  personId: string,
  excludeEventId: string,
  limit = 3,
  series?: { id: string | null; name: string } | null
) {
  const rows = await db.query.eventParticipants.findMany({
    where: eq(eventParticipants.personId, personId),
    with: { event: { with: { fathomRecording: true } } },
  });

  const now = new Date();
  return rows
    .map((row) => row.event)
    .filter(
      (event) =>
        event.id !== excludeEventId &&
        event.startsAt < now &&
        (series == null ||
          (series.id != null && event.recurringEventId === series.id) ||
          event.name === series.name)
    )
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .slice(0, limit)
    .map(withDecryptedRecording);
}

export async function getEvent(id: string) {
  const event = await db.query.calendarEvents.findFirst({
    where: eq(calendarEvents.id, id),
    with: {
      participants: {
        with: { person: true },
      },
      fathomRecording: true,
      todos: {
        with: { person: true },
        orderBy: [asc(todos.createdAt)],
      },
    },
  });
  return event ? withDecryptedRecording(event) : undefined;
}

// To-dos assigned to any of the given people (matched by email), each with the
// meeting it came from so the page can group and link back. Emails are matched
// case-insensitively; a person with no email match is ignored. Newest meeting
// first, then oldest-first within a meeting to preserve the order they were
// discussed. Returns an empty array when none of the emails map to a person.
export async function listTodosForEmails(emails: string[]) {
  const normalized = emails.map((e) => e.toLowerCase());
  const people = await db.query.persons.findMany({
    columns: { id: true },
    // persons.email is stored as entered; compare lowercased on both sides.
    where: inArray(sql`lower(${persons.email})`, normalized),
  });
  const personIds = people.map((p) => p.id);
  if (personIds.length === 0) return [];

  return db.query.todos.findMany({
    where: inArray(todos.personId, personIds),
    with: {
      person: true,
      event: { with: { fathomRecording: { columns: { url: true } } } },
    },
    orderBy: [asc(todos.createdAt)],
  });
}

export async function listPersons() {
  return db.query.persons.findMany({
    orderBy: [asc(persons.name)],
    with: {
      participations: { with: { event: true } },
    },
  });
}

export async function getPerson(id: string) {
  return db.query.persons.findFirst({
    where: eq(persons.id, id),
    with: {
      participations: {
        with: { event: true },
      },
    },
  });
}
