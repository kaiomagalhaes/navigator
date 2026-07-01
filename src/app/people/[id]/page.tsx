// Person page: who this person is, plus the action items from the last 3
// meetings they shared with a Kaio identity — grouped by meeting — so Kaio can
// see what was agreed with them and prepare for their next conversation.
// Meeting/action-item data is fetched live from Fathom (MCP); the person's
// identity comes from the synced People table.
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  fetchPersonMeetingTodos,
  type MeetingTodos,
  type PersonRef,
} from "@/lib/fathom/todos";

export const dynamic = "force-dynamic";

function MeetingCard({ meeting }: { meeting: MeetingTodos }) {
  return (
    <section className="detail-section">
      <h2>
        <a href={meeting.url} target="_blank" rel="noreferrer">
          {meeting.title}
        </a>
        {meeting.date && <span className="muted"> · {meeting.date}</span>}
      </h2>
      {meeting.items.length === 0 ? (
        <p className="muted">No action items in this meeting.</p>
      ) : (
        <ul className="action-items">
          {meeting.items.map((item, i) => (
            <li key={i} className={item.assignedToPerson ? "assigned-to" : ""}>
              <span className="checkbox">{item.completed ? "☑" : "☐"}</span>
              <span>
                {item.description}
                {item.assigneeName && (
                  <span className="muted"> — {item.assigneeName}</span>
                )}
                {item.playbackUrl && (
                  <>
                    {" "}
                    <a href={item.playbackUrl} target="_blank" rel="noreferrer">
                      ↗
                    </a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function Meetings({ person }: { person: PersonRef }) {
  let result;
  try {
    result = await fetchPersonMeetingTodos(person);
  } catch (err) {
    return (
      <p className="cal-error">
        Couldn&apos;t load meetings from Fathom:{" "}
        {err instanceof Error ? err.message : String(err)}
      </p>
    );
  }

  if (result.meetings.length === 0) {
    return (
      <p className="empty">
        No recent meetings with this person and Kaio found in Fathom.
      </p>
    );
  }

  return (
    <>
      {result.meetings.map((m) => (
        <MeetingCard key={m.url} meeting={m} />
      ))}
    </>
  );
}

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isInteger(personId)) notFound();

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { name: true, email: true },
  });
  if (!person) notFound();

  return (
    <main className="page">
      <Link href="/people" className="back-link">
        ← People
      </Link>

      <header className="header">
        <h1>{person.name ?? person.email ?? "Unknown person"}</h1>
        <p className="subtitle">
          {person.name && person.email ? person.email : null}
          {person.name && person.email ? " · " : null}
          To-dos from your last 3 meetings together
        </p>
      </header>

      <Suspense
        fallback={<p className="muted">Loading meetings from Fathom…</p>}
      >
        <Meetings person={person} />
      </Suspense>
    </main>
  );
}
