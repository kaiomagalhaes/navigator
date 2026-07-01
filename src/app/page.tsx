// Daily view: today's meetings merged across both Google calendars.
// On the first load of the day the events are captured to Postgres; this view
// (and the event detail page) then read from those stored rows.
import Link from "next/link";
import { configuredAccounts } from "@/lib/calendar/ical";
import { getTodayEvents, now } from "@/lib/calendar/daily";
import { RefreshToday } from "./refresh-today";

export const dynamic = "force-dynamic";

function fullDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function time(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function DailyView() {
  const day = now();

  if (configuredAccounts().length === 0) {
    return (
      <main className="page">
        <header className="header">
          <h1>Today</h1>
          <p className="subtitle">{fullDate(day)}</p>
        </header>
        <p className="empty">
          No calendars configured. Add your Google Calendar secret iCal URLs as{" "}
          <code>GOOGLE_ICAL_URL_CODELITT</code> and{" "}
          <code>GOOGLE_ICAL_URL_CARBONCREI</code> in <code>.env.local</code>.
        </p>
      </main>
    );
  }

  const { events, errors } = await getTodayEvents(day);

  return (
    <main className="page">
      <header className="header">
        <h1>Today</h1>
        <p className="subtitle">{fullDate(day)}</p>
        <RefreshToday />
      </header>

      {errors.length > 0 && (
        <p className="cal-error">Couldn&apos;t load: {errors.join("; ")}</p>
      )}

      {events.length === 0 ? (
        <p className="empty">No meetings today. 🎉</p>
      ) : (
        <ul className="agenda">
          {events.map((e) => (
            <li key={e.id} className="agenda-item">
              <div className="agenda-time">
                {e.allDay ? (
                  <span>All day</span>
                ) : (
                  <>
                    <span>{time(e.start)}</span>
                    {e.end && <span className="muted">{time(e.end)}</span>}
                  </>
                )}
              </div>
              <div className="agenda-body">
                <div className="agenda-title">
                  <Link href={`/calendar/${e.id}`}>{e.title}</Link>
                  <span className={`cal-badge cal-${e.account}`}>
                    {e.account}
                  </span>
                </div>
                <div className="agenda-meta">
                  {e.conferenceUrl && (
                    <a href={e.conferenceUrl} target="_blank" rel="noreferrer">
                      Join call ↗
                    </a>
                  )}
                  {e.people.length > 0 && (
                    <span className="muted">{e.people.length} people</span>
                  )}
                  {e.location && <span className="muted">{e.location}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="agenda-footer">
        <Link href="/meetings">Browse synced meetings →</Link>
      </p>
    </main>
  );
}
