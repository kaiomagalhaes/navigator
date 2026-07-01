// Reads today's events from the two Google Calendar "secret iCal" feeds and
// merges both accounts. No OAuth — each feed is a private .ics URL from env.
//
// Uses node-ical's expandRecurringEvent (rrule range query) so recurring events
// are expanded only within the requested window — not iterated from their
// original start date, which would blow up memory for long-running series.
import * as ical from "node-ical";
import type { VEvent } from "node-ical";

export interface CalendarAccount {
  label: string;
  email: string;
  url: string;
}

export interface EventAttendee {
  email: string;
  name: string | null;
}

export interface CalendarEvent {
  account: string;
  uid: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  location: string | null;
  conferenceUrl: string | null;
  attendees: EventAttendee[];
}

/** The configured calendars (only those with a URL set). */
export function configuredAccounts(): CalendarAccount[] {
  const accounts: CalendarAccount[] = [];
  const codelitt = process.env.GOOGLE_ICAL_URL_CODELITT;
  const carboncrei = process.env.GOOGLE_ICAL_URL_CARBONCREI;
  if (codelitt) {
    accounts.push({ label: "codelitt", email: "kaio@codelitt.com", url: codelitt });
  }
  if (carboncrei) {
    accounts.push({
      label: "carboncrei",
      email: "kaio@carboncrei.com",
      url: carboncrei,
    });
  }
  return accounts;
}

const CONFERENCE_RE =
  /(https?:\/\/(?:[\w.-]*\.)?(?:meet\.google\.com|zoom\.us|[\w.-]*teams\.microsoft\.com|teams\.live\.com|whereby\.com)\/[^\s>"']+)/i;

// node-ical text properties can be a plain string or { val, params }.
function text(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "val" in value) {
    return String((value as { val: unknown }).val);
  }
  return String(value);
}

function extractConference(event: VEvent): string | null {
  const x = text((event as Record<string, unknown>)["x-google-conference"]);
  if (x) return x;
  for (const field of [text(event.location), text(event.description)]) {
    const m = field?.match(CONFERENCE_RE);
    if (m) return m[1];
  }
  return null;
}

function displayLocation(event: VEvent): string | null {
  const loc = text(event.location)?.trim();
  if (!loc) return null;
  // A bare URL is surfaced as the join link instead.
  if (/^https?:\/\//i.test(loc)) return null;
  return loc;
}

// Attendees with email + display name, de-duplicated by email. ATTENDEE is
// "mailto:x@y" or { val: "mailto:x@y", params: { CN: "Display Name" } }.
function eventAttendees(event: VEvent): EventAttendee[] {
  const raw = event.attendee;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const byEmail = new Map<string, EventAttendee>();
  for (const a of list) {
    let val = "";
    let name: string | null = null;
    if (typeof a === "string") {
      val = a;
    } else if (a && typeof a === "object") {
      if ("val" in a) val = String((a as { val: unknown }).val);
      const params = (a as { params?: Record<string, unknown> }).params;
      const cn = params?.CN;
      if (cn != null) name = String(cn).trim() || null;
    }
    const email = val.replace(/^mailto:/i, "").trim().toLowerCase();
    if (!email) continue;
    // Keep the first non-null name we see for a given email.
    const existing = byEmail.get(email);
    if (existing) {
      if (!existing.name && name) existing.name = name;
    } else {
      byEmail.set(email, { email, name });
    }
  }
  return Array.from(byEmail.values());
}

function toEvent(
  account: string,
  base: VEvent,
  start: Date,
  end: Date | null,
  allDay: boolean,
): CalendarEvent {
  return {
    account,
    uid: base.uid,
    title: text(base.summary) || "(no title)",
    start,
    end,
    allDay,
    location: displayLocation(base),
    conferenceUrl: extractConference(base),
    attendees: eventAttendees(base),
  };
}

async function fetchIcs(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}


function eventsInRange(
  label: string,
  data: ical.CalendarResponse,
  start: Date,
  end: Date,
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const value of Object.values(data)) {
    if (!value || value.type !== "VEVENT") continue;
    const ev = value;

    if (ev.rrule) {
      const instances = ical.expandRecurringEvent(ev, { from: start, to: end });
      for (const inst of instances) {
        out.push(toEvent(label, inst.event, inst.start, inst.end, inst.isFullDay));
      }
    } else {
      const s = ev.start as Date;
      const e = (ev.end as Date) ?? s;
      if (e > start && s <= end) {
        out.push(toEvent(label, ev, s, e, ev.datetype === "date"));
      }
    }
  }
  return out;
}

/** Fetch and merge today's events across all configured calendars. */
export async function fetchDayEvents(
  day: Date,
): Promise<{ events: CalendarEvent[]; errors: string[] }> {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);

  const errors: string[] = [];
  const events: CalendarEvent[] = [];

  await Promise.all(
    configuredAccounts().map(async (acc) => {
      try {
        const data = await ical.async.parseICS(await fetchIcs(acc.url));
        events.push(...eventsInRange(acc.label, data, start, end));
      } catch (err) {
        errors.push(
          `${acc.label}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { events, errors };
}
