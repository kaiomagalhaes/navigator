// Calendar event detail — reads the stored event (captured on the daily view's
// first load of the day), not the live iCal feed. Members are emails only.
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatWhen(date: Date, allDay: boolean): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }),
  }).format(date);
}

function duration(start: Date, end: Date | null): string | null {
  if (!end) return null;
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m} min`;
}

export default async function CalendarEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    include: {
      people: {
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: { id: true, name: true, email: true },
      },
    },
  });
  if (!event) notFound();

  const dur = duration(event.start, event.end);

  return (
    <main className="page">
      <Link href="/" className="back-link">
        ← Today
      </Link>

      <header className="header">
        <h1>{event.title}</h1>
        <p className="subtitle">
          {formatWhen(event.start, event.allDay)}
          {dur && ` · ${dur}`}
          {" · "}
          <span className={`cal-badge cal-${event.account}`}>
            {event.account}
          </span>
          {event.conferenceUrl && (
            <>
              {" · "}
              <a href={event.conferenceUrl} target="_blank" rel="noreferrer">
                Join call ↗
              </a>
            </>
          )}
        </p>
      </header>

      {event.location && (
        <section className="detail-section">
          <h2>Location</h2>
          <p>{event.location}</p>
        </section>
      )}

      <section className="detail-section">
        <h2>Participants ({event.people.length})</h2>
        {event.people.length === 0 ? (
          <p className="muted">No participants listed on this event.</p>
        ) : (
          <ul className="participants">
            {event.people.map((p) => (
              <li key={p.id}>
                <Link href={`/people/${p.id}`}>
                  {p.name ?? p.email ?? "Unknown"}
                </Link>
                {p.email && p.name && (
                  <span className="muted"> · {p.email}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {event.people.length > 0 && (
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Click a person to see their to-dos from your last 3 meetings.
          </p>
        )}
      </section>
    </main>
  );
}
