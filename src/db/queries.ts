import "server-only";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import { calendarEvents, eventParticipants, googleAccounts, persons, todos } from "./schema";

// Connected Google accounts, without exposing stored tokens to callers/UI.
export async function listGoogleAccounts() {
  return db.query.googleAccounts.findMany({
    orderBy: [asc(googleAccounts.createdAt)],
    columns: { id: true, email: true, createdAt: true },
  });
}

export async function listEvents() {
  return db.query.calendarEvents.findMany({
    // Newest first (most recent / upcoming events at the top).
    orderBy: [desc(calendarEvents.startsAt)],
    with: {
      participants: { with: { person: true } },
      fathomRecording: true,
    },
  });
}

// The most recent past meetings a given person took part in, newest first,
// excluding one event (the one you're currently viewing). Used on the event
// page to show "the last few times we met with each attendee".
export async function listRecentMeetingsWithPerson(
  personId: string,
  excludeEventId: string,
  limit = 3
) {
  const rows = await db.query.eventParticipants.findMany({
    where: eq(eventParticipants.personId, personId),
    with: { event: { with: { fathomRecording: true } } },
  });

  const now = new Date();
  return rows
    .map((row) => row.event)
    .filter((event) => event.id !== excludeEventId && event.startsAt < now)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .slice(0, limit);
}

export async function getEvent(id: string) {
  return db.query.calendarEvents.findFirst({
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
