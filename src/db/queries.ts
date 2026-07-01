import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { calendarEvents, googleAccounts, persons } from "./schema";

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
    },
  });
}

export async function getEvent(id: string) {
  return db.query.calendarEvents.findFirst({
    where: eq(calendarEvents.id, id),
    with: {
      participants: {
        with: { person: true },
      },
      fathomRecording: true,
    },
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
