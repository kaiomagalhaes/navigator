import "server-only";
import { google, type Auth, type calendar_v3 } from "googleapis";

// Google event types that are personal blocks, not real meetings.
const NON_MEETING_TYPES = new Set(["outOfOffice", "focusTime", "workingLocation"]);

export type NormalizedAttendee = {
  name: string;
  email: string;
  responseStatus: string;
};

export type NormalizedEvent = {
  googleEventId: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  organizerEmail: string | null;
  // Google's parent recurring-series id; null for one-off events.
  recurringEventId: string | null;
  // The user's own RSVP ("declined" hides the meeting from the day view).
  selfResponseStatus: string | null;
  attendees: NormalizedAttendee[];
};

function eventDate(point: calendar_v3.Schema$EventDateTime | undefined): Date | null {
  const value = point?.dateTime ?? point?.date; // dateTime for timed, date for all-day
  return value ? new Date(value) : null;
}

// The authenticated user's own RSVP for this event ("accepted" / "declined" /
// "tentative" / "needsAction"), or null when we aren't listed as an attendee.
// Google flags our attendee entry with `self: true`. Used to hide meetings the
// user declined from the day view.
function selfResponseStatus(e: calendar_v3.Schema$Event): string | null {
  return (e.attendees ?? []).find((a) => a.self)?.responseStatus ?? null;
}

// Fetch every event in [from, to] for the primary calendar, following pagination.
async function listAllEvents(
  auth: Auth.OAuth2Client,
  from: Date,
  to: Date
): Promise<calendar_v3.Schema$Event[]> {
  const calendar = google.calendar({ version: "v3", auth });
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await calendar.events.list({
      calendarId: "primary",
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: true, // expand recurring events into instances
      orderBy: "startTime",
      maxResults: 250,
      pageToken,
    });
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

// A single item on the day's agenda. Carries the same attendee/organizer fields
// as NormalizedEvent (so it can be persisted the same way) plus a couple of
// display extras. Unlike fetchMeetingEvents, this keeps upcoming events too.
export type DayEvent = {
  googleEventId: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  isAllDay: boolean;
  location: string | null;
  organizerEmail: string | null;
  // Google's parent recurring-series id; null for one-off events.
  recurringEventId: string | null;
  // The user's own RSVP ("declined" hides the meeting from the day view).
  selfResponseStatus: string | null;
  attendees: NormalizedAttendee[];
};

// Real meetings on the calendar between [from, to], sorted by start time. Like
// fetchMeetingEvents it drops out-of-office / focus-time blocks and anything
// with fewer than two people — but, unlike it, keeps upcoming events (this
// powers the welcome page's "today at a glance" view).
export async function fetchDayEvents(
  auth: Auth.OAuth2Client,
  from: Date,
  to: Date
): Promise<DayEvent[]> {
  const raw = await listAllEvents(auth, from, to);

  const events: DayEvent[] = [];
  for (const e of raw) {
    if (NON_MEETING_TYPES.has(e.eventType ?? "default")) continue;

    const attendees = (e.attendees ?? [])
      .filter((a) => a.email && !a.resource) // skip room/resource entries
      .map((a) => ({
        name: (a.displayName ?? a.email!.split("@")[0]).trim(),
        email: a.email!.toLowerCase(),
        responseStatus: a.responseStatus ?? "needsAction",
      }));
    if (attendees.length < 2) continue; // skip solo blocks — only real meetings

    const startsAt = eventDate(e.start ?? undefined);
    const endsAt = eventDate(e.end ?? undefined);
    if (!e.id || !startsAt || !endsAt) continue;

    events.push({
      googleEventId: e.id,
      name: e.summary?.trim() || "(no title)",
      startsAt,
      endsAt,
      isAllDay: !e.start?.dateTime, // all-day events carry `date`, not `dateTime`
      location: e.location?.trim() || null,
      organizerEmail: e.organizer?.email ? e.organizer.email.toLowerCase() : null,
      recurringEventId: e.recurringEventId ?? null,
      selfResponseStatus: selfResponseStatus(e),
      attendees,
    });
  }

  events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return events;
}

// Fetch, then drop non-meetings / OOO and anything with fewer than 2 attendees.
export async function fetchMeetingEvents(
  auth: Auth.OAuth2Client,
  from: Date,
  to: Date
): Promise<NormalizedEvent[]> {
  const raw = await listAllEvents(auth, from, to);
  const now = new Date();

  const normalized: NormalizedEvent[] = [];
  for (const e of raw) {
    if (NON_MEETING_TYPES.has(e.eventType ?? "default")) continue;

    const attendees = (e.attendees ?? [])
      .filter((a) => a.email && !a.resource) // skip room/resource entries
      .map((a) => ({
        name: (a.displayName ?? a.email!.split("@")[0]).trim(),
        email: a.email!.toLowerCase(),
        responseStatus: a.responseStatus ?? "needsAction",
      }));

    if (attendees.length < 2) continue;

    const startsAt = eventDate(e.start ?? undefined);
    const endsAt = eventDate(e.end ?? undefined);
    if (!e.id || !startsAt || !endsAt) continue;

    // Only import meetings that have already happened — skip future events.
    if (startsAt > now) continue;

    normalized.push({
      googleEventId: e.id,
      name: e.summary?.trim() || "(no title)",
      startsAt,
      endsAt,
      organizerEmail: e.organizer?.email ? e.organizer.email.toLowerCase() : null,
      recurringEventId: e.recurringEventId ?? null,
      selfResponseStatus: selfResponseStatus(e),
      attendees,
    });
  }

  return normalized;
}
