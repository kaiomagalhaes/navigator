import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, eventParticipants, persons } from "@/db/schema";

// The minimum an event needs to be upserted into calendar_events + persons.
// Both the Google import (NormalizedEvent) and the today view (DayEvent)
// satisfy this shape.
export type PersistableEvent = {
  googleEventId: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  organizerEmail: string | null;
  attendees: { name: string; email: string }[];
  // Present on the day view (DayEvent); absent on the import path (NormalizedEvent),
  // where they default to false / null.
  isAllDay?: boolean;
  location?: string | null;
  // Google's parent recurring-series id; null for one-off events.
  recurringEventId?: string | null;
};

// Idempotently upsert events (and their attendees) for one account. Events are
// keyed on (account_id, google_event_id); attendees on email. The participant
// set is reconciled so removed attendees drop off. Returns each input event
// with the id of its stored row (preserving any extra fields on the input).
export async function persistEvents<T extends PersistableEvent>(
  accountId: string,
  events: T[]
): Promise<(T & { id: string })[]> {
  const stored: (T & { id: string })[] = [];

  await db.transaction(async (tx) => {
    for (const event of events) {
      const personIds: string[] = [];
      for (const attendee of event.attendees) {
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

      const [saved] = await tx
        .insert(calendarEvents)
        .values({
          name: event.name,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          isAllDay: event.isAllDay ?? false,
          location: event.location ?? null,
          accountId,
          googleEventId: event.googleEventId,
          recurringEventId: event.recurringEventId ?? null,
          organizerEmail: event.organizerEmail,
        })
        .onConflictDoUpdate({
          target: [calendarEvents.accountId, calendarEvents.googleEventId],
          set: {
            name: event.name,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            isAllDay: event.isAllDay ?? false,
            location: event.location ?? null,
            recurringEventId: event.recurringEventId ?? null,
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

      stored.push({ ...event, id: saved.id });
    }
  });

  return stored;
}
