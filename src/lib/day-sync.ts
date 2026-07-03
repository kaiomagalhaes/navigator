import "server-only";
import { and, eq, gte, lt, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, daySyncs } from "@/db/schema";
import { getAuthedClient } from "@/lib/google";
import { fetchDayEvents, type DayEvent } from "@/lib/google-calendar";
import { persistEvents } from "@/lib/events-store";
import { listEventsForDay } from "@/db/queries";

export type DaySyncResult = { changed: boolean; lastSyncedAt: Date };

// A stable, order-independent signature of one meeting, covering everything the
// day view cares about: identity, timing, place, and who's invited. Any add,
// delete, edit, or attendee change produces a different fingerprint.
function fingerprint(parts: {
  accountId: string;
  googleEventId: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  isAllDay: boolean;
  location: string | null;
  recurringEventId: string | null;
  selfResponseStatus: string | null;
  emails: string[];
}): string {
  return [
    parts.accountId,
    parts.googleEventId,
    parts.name,
    parts.startsAt.toISOString(),
    parts.endsAt.toISOString(),
    parts.isAllDay,
    parts.location ?? "",
    parts.recurringEventId ?? "",
    // Include our RSVP so changing it (e.g. declining) counts as a change and
    // triggers a re-persist — otherwise the day view never learns we said no.
    parts.selfResponseStatus ?? "",
    [...parts.emails].map((e) => e.toLowerCase()).sort().join(","),
  ].join("|");
}

// Compare two fingerprint sets regardless of order.
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

async function touchDaySync(date: string): Promise<Date> {
  const lastSyncedAt = new Date();
  await db
    .insert(daySyncs)
    .values({ date, lastSyncedAt })
    .onConflictDoUpdate({ target: daySyncs.date, set: { lastSyncedAt } });
  return lastSyncedAt;
}

// Pull one day's meetings from every connected Google account and reconcile the
// DB when (and only when) something changed. Records the sync time either way.
// Calendar-only: it deliberately skips Fathom linking (see importCalendarRange)
// so a per-minute poll stays cheap and never trips Fathom's rate limit.
export async function syncDay(
  dayStart: Date,
  dayEnd: Date,
  dateKey: string
): Promise<DaySyncResult> {
  const accounts = await db.query.googleAccounts.findMany();
  if (accounts.length === 0) {
    return { changed: false, lastSyncedAt: await touchDaySync(dateKey) };
  }

  // Fetch each account independently. A failed fetch drops that account from
  // both the comparison and the write, so a transient Google error can't wipe
  // stored events for that account.
  const fetched: { accountId: string; events: DayEvent[] }[] = [];
  for (const account of accounts) {
    try {
      const auth = await getAuthedClient(account);
      const events = await fetchDayEvents(auth, dayStart, dayEnd);
      fetched.push({ accountId: account.id, events });
    } catch (err) {
      console.error("[day-sync]", account.email, err);
    }
  }
  const fetchedAccountIds = new Set(fetched.map((f) => f.accountId));

  // Current DB state for the day, limited to the accounts we successfully
  // fetched (manual events have a null accountId and are never synced).
  const stored = await listEventsForDay(dayStart, dayEnd);
  const before = stored
    .filter((e) => e.accountId && e.googleEventId && fetchedAccountIds.has(e.accountId))
    .map((e) =>
      fingerprint({
        accountId: e.accountId!,
        googleEventId: e.googleEventId!,
        name: e.name,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        isAllDay: e.isAllDay,
        location: e.location,
        recurringEventId: e.recurringEventId,
        selfResponseStatus: e.selfResponseStatus,
        emails: e.participants.map((p) => p.person.email),
      })
    );

  const after = fetched.flatMap(({ accountId, events }) =>
    events.map((e) =>
      fingerprint({
        accountId,
        googleEventId: e.googleEventId,
        name: e.name,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        isAllDay: e.isAllDay,
        location: e.location,
        recurringEventId: e.recurringEventId,
        selfResponseStatus: e.selfResponseStatus,
        emails: e.attendees.map((a) => a.email),
      })
    )
  );

  if (sameSet(before, after)) {
    return { changed: false, lastSyncedAt: await touchDaySync(dateKey) };
  }

  // Something changed: upsert the fetched events and drop any that vanished.
  for (const { accountId, events } of fetched) {
    await persistEvents(accountId, events);

    const keepIds = events.map((e) => e.googleEventId);
    const dayScope = and(
      eq(calendarEvents.accountId, accountId),
      gte(calendarEvents.startsAt, dayStart),
      lt(calendarEvents.startsAt, dayEnd)
    );
    await db
      .delete(calendarEvents)
      .where(
        keepIds.length > 0
          ? and(dayScope, notInArray(calendarEvents.googleEventId, keepIds))
          : dayScope
      );
  }

  return { changed: true, lastSyncedAt: await touchDaySync(dateKey) };
}
