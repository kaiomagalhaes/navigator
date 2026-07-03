import Link from "next/link";
import { db } from "@/db";
import { getAuthedClient } from "@/lib/google";
import { fetchDayEvents } from "@/lib/google-calendar";
import { persistEvents } from "@/lib/events-store";
import { getDaySync, listEventsForDay, listSkippedSeriesIds } from "@/db/queries";
import { formatTime, formatDay, toDateParam, parseDayParam, dayWindow } from "@/lib/format";
import { DateNav } from "@/components/date-nav";
import { DayLiveSync } from "@/components/day-live-sync";
import { PrepareTodayOnce } from "@/components/prepare-today-once";
import { PrepareDayButton } from "@/components/prepare-day-button";

// This page reads a day's agenda on every request (from the DB, falling back to
// a live Google pull), so never cache it.
export const dynamic = "force-dynamic";

// One row on the day's agenda, however it was sourced (stored or freshly pulled).
type AgendaEvent = {
  id: string;
  // Google's id when known; null for manually-created events. Used to identify
  // and de-duplicate the same meeting shared across connected calendars.
  googleEventId: string | null;
  name: string;
  startsAt: Date;
  endsAt: Date;
  isAllDay: boolean;
  location: string | null;
  attendeeCount: number;
  // Whether this meeting has a saved Prepare briefing (calendar_events.prep).
  prepared: boolean;
  // Whether this is an occurrence of a recurring Google series.
  recurring: boolean;
  // Whether this meeting's recurring series is marked "skip auto-prep".
  skipPrep: boolean;
  // Which connected calendar(s) this meeting came from, as short labels derived
  // from the account email (e.g. "Codelitt", "Carboncrei"). Usually one; a
  // meeting shared across both accounts carries both. Empty for manual events.
  calendars: string[];
};

type DayResult =
  | { status: "no-accounts" }
  | { status: "error" }
  | { status: "ok"; events: AgendaEvent[] };

// A meeting's identity for de-duplication across calendars: its Google id when
// present, else its own row id (manual events never collide).
const eventKey = (e: AgendaEvent) => e.googleEventId ?? e.id;

// Short calendar label from an account email, e.g. "kaio@codelitt.com" →
// "Codelitt". Null for manual events (no account) or unparseable emails.
function calendarLabel(email: string | null | undefined): string | null {
  const domain = email?.split("@")[1]?.split(".")[0];
  if (!domain) return null;
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

// Collapse the same meeting shared across calendars into one row, merging the
// calendar labels so a meeting on both accounts shows both marks.
function dedupe(events: AgendaEvent[]): AgendaEvent[] {
  const byKey = new Map<string, AgendaEvent>();
  for (const e of events) {
    const existing = byKey.get(eventKey(e));
    if (existing) {
      existing.calendars = Array.from(new Set([...existing.calendars, ...e.calendars])).sort();
    } else {
      byKey.set(eventKey(e), { ...e, calendars: [...e.calendars] });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

// Load the agenda for [dayStart, dayEnd). DB-first: show events already stored
// for the day, and only pull them from Google (persisting as we go) when none
// are stored yet. So selecting a fresh day fetches it once, then reads locally.
async function getDayEvents(dayStart: Date, dayEnd: Date): Promise<DayResult> {
  const accounts = await db.query.googleAccounts.findMany();
  if (accounts.length === 0) return { status: "no-accounts" };

  // account id → calendar label, so each event can be marked with its calendar.
  const labelByAccount = new Map(accounts.map((a) => [a.id, calendarLabel(a.email)]));
  const calendarsFor = (accountId: string | null): string[] => {
    const label = accountId != null ? labelByAccount.get(accountId) : null;
    return label ? [label] : [];
  };

  // Recurring series marked "skip auto-prep" — used to flag agenda rows.
  const skipped = await listSkippedSeriesIds();
  const isSkipped = (recurringEventId: string | null) =>
    recurringEventId != null && skipped.has(recurringEventId);

  const stored = await listEventsForDay(dayStart, dayEnd);
  if (stored.length > 0) {
    // A meeting can live on more than one calendar (same Google id). If we
    // declined it on any of them, hide it everywhere — declining once means
    // we're not going.
    const declinedKeys = new Set(
      stored.filter((e) => e.selfResponseStatus === "declined").map((e) => e.googleEventId ?? e.id)
    );
    return {
      status: "ok",
      events: dedupe(
        stored
          .filter((e) => !declinedKeys.has(e.googleEventId ?? e.id))
          .map((e) => ({
          id: e.id,
          googleEventId: e.googleEventId,
          name: e.name,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          isAllDay: e.isAllDay,
          location: e.location,
          attendeeCount: e.participants.length,
          prepared: e.prep != null,
          recurring: e.recurringEventId != null,
          skipPrep: isSkipped(e.recurringEventId),
          calendars: calendarsFor(e.accountId),
        }))
      ),
    };
  }

  // Nothing stored for this day yet — pull it from every connected calendar and
  // store it, so each meeting gets a real event page to link to.
  try {
    const perAccount = await Promise.all(
      accounts.map(async (account) => {
        const auth = await getAuthedClient(account);
        const events = await fetchDayEvents(auth, dayStart, dayEnd);
        const stored = await persistEvents(account.id, events);
        return stored.map((e) => ({ ...e, calendars: calendarsFor(account.id) }));
      })
    );

    const flat = perAccount.flat();
    // Hide a meeting we declined on any calendar (see the stored path above).
    const declinedKeys = new Set(
      flat.filter((e) => e.selfResponseStatus === "declined").map((e) => e.googleEventId ?? e.id)
    );
    const events = flat
      .filter((e) => !declinedKeys.has(e.googleEventId ?? e.id))
      .map((e) => ({
      id: e.id,
      googleEventId: e.googleEventId,
      name: e.name,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      isAllDay: e.isAllDay,
      location: e.location,
      attendeeCount: e.attendees.length,
      prepared: false, // just pulled from Google; not prepared yet
      recurring: e.recurringEventId != null,
      skipPrep: isSkipped(e.recurringEventId),
      calendars: e.calendars,
    }));

    return { status: "ok", events: dedupe(events) };
  } catch (err) {
    console.error("[home] failed to load the day's events", err);
    return { status: "error" };
  }
}

function greeting(hour: number): { text: string; emoji: string } {
  if (hour < 12) return { text: "Good morning", emoji: "☀️" };
  if (hour < 18) return { text: "Good afternoon", emoji: "🌤️" };
  return { text: "Good evening", emoji: "🌙" };
}

type Tense = "today" | "past" | "future";

// A little personality: pick an emoji from the event title, falling back to 📌.
function eventEmoji(name: string): string {
  const n = name.toLowerCase();
  if (/\b1[:\s-]?on[:\s-]?1\b|\b1:1\b/.test(n)) return "🤝";
  if (/lunch|dinner|coffee|breakfast/.test(n)) return "☕️";
  if (/interview|hiring|candidate/.test(n)) return "🧑‍💼";
  if (/standup|stand-up|sync|check-?in/.test(n)) return "🗓️";
  if (/demo|review|retro/.test(n)) return "🎯";
  if (/birthday|celebrat|party/.test(n)) return "🎉";
  if (/focus|deep work/.test(n)) return "🎧";
  if (/gym|workout|run|yoga/.test(n)) return "🏃";
  return "📌";
}

// Per-calendar chip colors so each account reads at a glance. Unknown calendars
// fall back to a neutral chip.
const CALENDAR_STYLES: Record<string, string> = {
  Codelitt: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  Carboncrei: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
};
const CALENDAR_FALLBACK = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";

const ACCENTS = [
  { bar: "bg-rose-400", chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
  { bar: "bg-amber-400", chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  { bar: "bg-emerald-400", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  { bar: "bg-sky-400", chip: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300" },
  { bar: "bg-violet-400", chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { dayStart, dayEnd } = dayWindow(parseDayParam(date));
  const dateKey = toDateParam(dayStart);

  const dayDiff = Math.round((dayStart.getTime() - todayStart.getTime()) / 86_400_000);
  const tense: Tense = dayDiff === 0 ? "today" : dayDiff < 0 ? "past" : "future";
  const isToday = tense === "today";

  const result = await getDayEvents(dayStart, dayEnd);
  const events = result.status === "ok" ? result.events : [];
  const daySync = await getDaySync(dateKey);
  // Skipped-series meetings aren't prepped by the batch route, so exclude them
  // from the button count (keeps "Prep N meetings" in sync with what runs).
  const unpreparedCount = events.filter((e) => !e.prepared && !e.skipPrep).length;

  // "Happening now" / "Up next" only make sense for today.
  const nextUp = isToday ? events.find((e) => !e.isAllDay && e.endsAt > now) : undefined;
  const nextKey = nextUp ? eventKey(nextUp) : undefined;

  const { text, emoji } = greeting(now.getHours());
  const heading = isToday
    ? `${text}! ${emoji}`
    : dayDiff === -1
      ? "Yesterday"
      : dayDiff === 1
        ? "Tomorrow"
        : formatDay(dayStart);

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-8 text-white shadow-lg">
        <p className="text-sm font-medium uppercase tracking-wide text-white/80">
          {formatDay(dayStart)}
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">{heading}</h1>
        <p className="mt-3 text-lg text-white/90">{summaryLine(result, tense, now)}</p>
      </div>

      {/* Day selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {isToday ? "Today's agenda" : "Agenda"}
          </h2>
          {result.status !== "no-accounts" && (
            <div className="flex items-center gap-2">
              <DayLiveSync
                dateKey={dateKey}
                initialSyncedAt={daySync?.lastSyncedAt.toISOString() ?? null}
              />
              <PrepareTodayOnce dateKey={dateKey} isToday={isToday} />
              {!isToday && unpreparedCount > 0 && (
                <PrepareDayButton dateKey={dateKey} count={unpreparedCount} />
              )}
            </div>
          )}
        </div>
        <DateNav date={dateKey} today={toDateParam(todayStart)} />
      </div>

      {result.status === "no-accounts" && (
        <EmptyCard
          emoji="🔌"
          title="Let's get your calendar connected"
          body="Connect a Google Calendar and your day will show up right here."
          cta={{ href: "/calendars", label: "Connect a calendar" }}
        />
      )}

      {result.status === "error" && (
        <EmptyCard
          emoji="😵‍💫"
          title="Couldn't reach your calendar"
          body="Your Google connection may have expired. Reconnect it and try again."
          cta={{ href: "/calendars", label: "Manage calendars" }}
        />
      )}

      {result.status === "ok" && events.length === 0 && (
        <EmptyCard
          emoji={tense === "future" ? "📭" : "🌴"}
          title={
            tense === "today"
              ? "Your day is wide open"
              : tense === "future"
                ? "Nothing scheduled — yet"
                : "No meetings that day"
          }
          body={
            tense === "today"
              ? "Nothing on the calendar today — go enjoy it!"
              : tense === "future"
                ? "This day is clear so far. Check back as it fills up."
                : "There were no meetings on the calendar that day."
          }
        />
      )}

      {result.status === "ok" && events.length > 0 && (
        <section className="flex flex-col gap-3">
          {events.map((event, i) => {
            const accent = ACCENTS[i % ACCENTS.length];
            const isNext = eventKey(event) === nextKey;
            const isNow = isToday && !event.isAllDay && event.startsAt <= now && event.endsAt > now;
            return (
              <Link
                key={eventKey(event)}
                href={`/events/${event.id}`}
                className="relative flex gap-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-transform hover:-translate-y-0.5 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
              >
                <span className={`absolute inset-y-0 left-0 w-1.5 ${accent.bar}`} aria-hidden />
                <div className="pl-2 text-2xl" aria-hidden>
                  {eventEmoji(event.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold">{event.name}</h2>
                    {event.calendars.map((cal) => (
                      <span
                        key={cal}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${CALENDAR_STYLES[cal] ?? CALENDAR_FALLBACK}`}
                        title={`From your ${cal} calendar`}
                      >
                        <span aria-hidden>●</span> {cal}
                      </span>
                    ))}
                    {isNow && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                        <span aria-hidden>🔴</span> Happening now
                      </span>
                    )}
                    {!isNow && isNext && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${accent.chip}`}>
                        Up next
                      </span>
                    )}
                    {event.prepared && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <span aria-hidden>✓</span> Prepared
                      </span>
                    )}
                    {event.recurring && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        title="Recurring meeting"
                      >
                        <span aria-hidden>🔁</span> Recurring
                      </span>
                    )}
                    {event.skipPrep && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        title="Excluded from auto-prep"
                      >
                        Prep off
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {event.isAllDay
                      ? "All day"
                      : `${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`}
                    {event.location ? ` · ${event.location}` : ""}
                    {` · ${event.attendeeCount} people`}
                  </p>
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}

function summaryLine(result: DayResult, tense: Tense, now: Date): string {
  if (result.status === "no-accounts") return "Connect a calendar to see your day.";
  if (result.status === "error") return "We hit a snag loading your schedule.";

  const count = result.events.length;
  const plural = count === 1 ? "event" : "events";

  if (count === 0) {
    if (tense === "today") return "No events today — a clean slate. ✨";
    if (tense === "future") return "Nothing scheduled — yet.";
    return "No meetings on the calendar that day.";
  }

  if (tense === "past") return `${count} ${plural} that day. Here's what happened. 🗂️`;
  if (tense === "future") return `${count} ${plural} scheduled. Plan ahead. 🗓️`;

  const upcoming = result.events.filter((e) => !e.isAllDay && e.startsAt > now).length;
  if (upcoming === 0) return `${count} ${plural} today — you're all wrapped up. 🎉`;
  return `${count} ${plural} today, ${upcoming} still to come. Let's make it a great one! 🚀`;
}

function EmptyCard({
  emoji,
  title,
  body,
  cta,
}: {
  emoji: string;
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-950">
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-1 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
