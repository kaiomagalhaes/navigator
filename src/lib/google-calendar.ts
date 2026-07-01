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
  attendees: NormalizedAttendee[];
};

function eventDate(point: calendar_v3.Schema$EventDateTime | undefined): Date | null {
  const value = point?.dateTime ?? point?.date; // dateTime for timed, date for all-day
  return value ? new Date(value) : null;
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
      attendees,
    });
  }

  return normalized;
}
