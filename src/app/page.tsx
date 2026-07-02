import Link from "next/link";
import { db } from "@/db";
import { getAuthedClient } from "@/lib/google";
import { fetchDayEvents, type DayEvent } from "@/lib/google-calendar";
import { persistEvents } from "@/lib/events-store";
import { formatTime, formatDay } from "@/lib/format";

// This page reads live from Google Calendar on every request, so never cache it.
export const dynamic = "force-dynamic";

// A today event, once stored, carries the DB id we link to.
type TodayEvent = DayEvent & { id: string };

type TodayResult =
  | { status: "no-accounts" }
  | { status: "error" }
  | { status: "ok"; events: TodayEvent[] };

// Pull today's events from every connected Google Calendar and store them, so
// each has a real event page to link to. The upsert is idempotent, so loading
// the homepage repeatedly just keeps today's meetings in sync.
async function getTodaysEvents(): Promise<TodayResult> {
  const accounts = await db.query.googleAccounts.findMany();
  if (accounts.length === 0) return { status: "no-accounts" };

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayStart.getDate() + 1);

  try {
    const perAccount = await Promise.all(
      accounts.map(async (account) => {
        const auth = await getAuthedClient(account);
        const events = await fetchDayEvents(auth, dayStart, dayEnd);
        return persistEvents(account.id, events);
      })
    );

    // Merge calendars, de-duplicate shared events, and sort by start time.
    const seen = new Set<string>();
    const events = perAccount
      .flat()
      .filter((e) => (seen.has(e.googleEventId) ? false : seen.add(e.googleEventId)))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    return { status: "ok", events };
  } catch (err) {
    console.error("[home] failed to load today's events", err);
    return { status: "error" };
  }
}

function greeting(hour: number): { text: string; emoji: string } {
  if (hour < 12) return { text: "Good morning", emoji: "☀️" };
  if (hour < 18) return { text: "Good afternoon", emoji: "🌤️" };
  return { text: "Good evening", emoji: "🌙" };
}

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

const ACCENTS = [
  { bar: "bg-rose-400", chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
  { bar: "bg-amber-400", chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  { bar: "bg-emerald-400", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  { bar: "bg-sky-400", chip: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300" },
  { bar: "bg-violet-400", chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" },
];

export default async function Home() {
  const now = new Date();
  const { text, emoji } = greeting(now.getHours());
  const result = await getTodaysEvents();

  const events = result.status === "ok" ? result.events : [];
  const nextUpId = events.find((e) => !e.isAllDay && e.endsAt > now)?.googleEventId;

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-8 text-white shadow-lg">
        <p className="text-sm font-medium uppercase tracking-wide text-white/80">
          {formatDay(now)}
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          {text}! {emoji}
        </h1>
        <p className="mt-3 text-lg text-white/90">{summaryLine(result, now)}</p>
      </div>

      {/* Today */}
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
          emoji="🌴"
          title="Your day is wide open"
          body="Nothing on the calendar today — go enjoy it!"
        />
      )}

      {result.status === "ok" && events.length > 0 && (
        <section className="flex flex-col gap-3">
          {events.map((event, i) => {
            const accent = ACCENTS[i % ACCENTS.length];
            const isNext = event.googleEventId === nextUpId;
            const isNow = !event.isAllDay && event.startsAt <= now && event.endsAt > now;
            return (
              <Link
                key={event.googleEventId}
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
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {event.isAllDay
                      ? "All day"
                      : `${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`}
                    {event.location ? ` · ${event.location}` : ""}
                    {` · ${event.attendees.length} people`}
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

function summaryLine(result: TodayResult, now: Date): string {
  if (result.status === "no-accounts") return "Connect a calendar to see your day.";
  if (result.status === "error") return "We hit a snag loading your schedule.";

  const count = result.events.length;
  if (count === 0) return "No events today — a clean slate. ✨";

  const upcoming = result.events.filter((e) => !e.isAllDay && e.startsAt > now).length;
  const plural = count === 1 ? "event" : "events";
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
