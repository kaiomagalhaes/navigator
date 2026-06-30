// Meeting detail: summary, participants, action items, and full transcript.
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function MeetingDetail({
  params,
}: {
  params: Promise<{ recordingId: string }>;
}) {
  const { recordingId } = await params;
  const id = Number(recordingId);
  if (!Number.isInteger(id)) notFound();

  const meeting = await prisma.meeting.findUnique({
    where: { recordingId: id },
    include: {
      participants: true,
      actionItems: true,
      transcript: { orderBy: { idx: "asc" } },
    },
  });
  if (!meeting) notFound();

  return (
    <main className="page">
      <Link href="/" className="back-link">
        ← All meetings
      </Link>

      <header className="header">
        <h1>{meeting.title}</h1>
        <p className="subtitle">
          {formatDate(meeting.recordingStartTime ?? meeting.fathomCreatedAt)}
          {" · recorded by "}
          {meeting.recordedByName ?? meeting.recordedByEmail ?? "—"}
          {" · "}
          <a href={meeting.url} target="_blank" rel="noreferrer">
            open in Fathom ↗
          </a>
        </p>
      </header>

      <section className="detail-section">
        <h2>Participants ({meeting.participants.length})</h2>
        {meeting.participants.length === 0 ? (
          <p className="muted">No participants recorded.</p>
        ) : (
          <ul className="participants">
            {meeting.participants.map((p) => (
              <li key={p.id}>
                <span>{p.name ?? p.email ?? "Unknown"}</span>
                {p.email && p.name && <span className="muted"> · {p.email}</span>}
                {p.isExternal && <span className="badge">external</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="detail-section">
        <h2>Action items ({meeting.actionItems.length})</h2>
        {meeting.actionItems.length === 0 ? (
          <p className="muted">No action items.</p>
        ) : (
          <ul className="action-items">
            {meeting.actionItems.map((a) => (
              <li key={a.id}>
                <span className="checkbox">{a.completed ? "☑" : "☐"}</span>
                <span>
                  {a.description}
                  {a.assigneeName && (
                    <span className="muted"> — {a.assigneeName}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {meeting.summaryMarkdown && (
        <section className="detail-section">
          <h2>Summary</h2>
          <div className="summary">{meeting.summaryMarkdown}</div>
        </section>
      )}

      <section className="detail-section">
        <h2>Transcript ({meeting.transcript.length} segments)</h2>
        {meeting.transcript.length === 0 ? (
          <p className="muted">No transcript.</p>
        ) : (
          <ol className="transcript">
            {meeting.transcript.map((s) => (
              <li key={s.id}>
                <div className="seg-meta">
                  {s.timestamp && <span className="ts">{s.timestamp}</span>}
                  <span className="speaker">{s.speakerDisplayName ?? "—"}</span>
                </div>
                <p className="seg-text">{s.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
