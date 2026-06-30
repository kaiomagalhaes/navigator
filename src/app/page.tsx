// Minimal dashboard confirming synced data landed in Postgres.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SyncControls } from "./sync-controls";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Default the picker to the last 7 days. Kept out of the component body so the
// request-time clock read isn't flagged as impure render.
function defaultRange(): { start: string; end: string } {
  const now = Date.now();
  return {
    start: isoDay(new Date(now - 7 * 24 * 60 * 60 * 1000)),
    end: isoDay(new Date(now)),
  };
}

export default async function Home() {
  const [meetings, lastRun, totals] = await Promise.all([
    prisma.meeting.findMany({
      orderBy: { recordingStartTime: "desc" },
      take: 50,
      include: {
        _count: {
          select: { participants: true, actionItems: true, transcript: true },
        },
      },
    }),
    prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.meeting.count(),
  ]);

  const range = defaultRange();

  return (
    <main className="page">
      <header className="header header-row">
        <div>
          <h1>Navigator</h1>
          <p className="subtitle">Fathom meeting data &amp; AI processing hub</p>
        </div>
        <Link href="/chat" className="chat-cta">
          💬 Chat with your meetings
        </Link>
      </header>

      <SyncControls defaultStart={range.start} defaultEnd={range.end} />

      <section className="stats">
        <div className="stat">
          <span className="stat-value">{totals}</span>
          <span className="stat-label">meetings synced</span>
        </div>
        <div className="stat">
          <span className="stat-value">{lastRun?.status ?? "never"}</span>
          <span className="stat-label">last sync</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {formatDate(lastRun?.finishedAt ?? null)}
          </span>
          <span className="stat-label">finished at</span>
        </div>
      </section>

      {meetings.length === 0 ? (
        <p className="empty">
          No meetings yet. Run <code>npm run sync</code> to pull from Fathom.
        </p>
      ) : (
        <table className="meetings">
          <thead>
            <tr>
              <th>Meeting</th>
              <th>Date</th>
              <th>Recorded by</th>
              <th className="num">People</th>
              <th className="num">Actions</th>
              <th className="num">Segments</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/meetings/${m.recordingId}`}>{m.title}</Link>
                </td>
                <td>{formatDate(m.recordingStartTime ?? m.fathomCreatedAt)}</td>
                <td>{m.recordedByName ?? m.recordedByEmail ?? "—"}</td>
                <td className="num">{m._count.participants}</td>
                <td className="num">{m._count.actionItems}</td>
                <td className="num">{m._count.transcript}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
