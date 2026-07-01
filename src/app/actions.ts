"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, eventParticipants, googleAccounts, persons } from "@/db/schema";
import { getAuthedClient } from "@/lib/google";
import { fetchMeetingEvents } from "@/lib/google-calendar";

export type FormState = { error?: string };
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

export async function createEvent(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const endsAtRaw = String(formData.get("endsAt") ?? "");

  if (!name) return { error: "Name is required." };
  if (!startsAtRaw || !endsAtRaw) return { error: "Start and end times are required." };

  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { error: "Invalid date/time." };
  }
  if (endsAt < startsAt) {
    return { error: "End time must be after the start time." };
  }

  const [created] = await db
    .insert(calendarEvents)
    .values({ name, startsAt, endsAt })
    .returning({ id: calendarEvents.id });

  revalidatePath("/events");
  redirect(`/events/${created.id}`);
}

export async function createPerson(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!name) return { error: "Name is required." };
  if (!email) return { error: "Email is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  let created: { id: string };
  try {
    [created] = await db
      .insert(persons)
      .values({ name, email })
      .returning({ id: persons.id });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return { error: "A person with that email already exists." };
    }
    throw err;
  }

  revalidatePath("/people");
  redirect(`/people/${created.id}`);
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

export async function disconnectAccount(formData: FormData): Promise<void> {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return;
  await db.delete(googleAccounts).where(eq(googleAccounts.id, accountId));
  revalidatePath("/calendars");
}

export async function addParticipant(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  if (!eventId || !personId) return;

  await db
    .insert(eventParticipants)
    .values({ eventId, personId })
    .onConflictDoNothing();

  revalidatePath(`/events/${eventId}`);
}

export async function removeParticipant(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  if (!eventId || !personId) return;

  await db
    .delete(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.personId, personId)
      )
    );

  revalidatePath(`/events/${eventId}`);
}
