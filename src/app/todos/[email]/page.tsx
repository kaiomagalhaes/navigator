// To-dos page: Fathom action items from the last 3 meetings, grouped into Kaio's
// and the clicked person's, plus an AI briefing of what to discuss next.
import { Suspense } from "react";
import Link from "next/link";
import {
  fetchTodos,
  type TodoItem,
  type RecentMeeting,
} from "@/lib/fathom/todos";
import { suggestNextMeetingTopics } from "@/lib/ai/next-meeting";
import { Markdown } from "../../markdown";

export const dynamic = "force-dynamic";

async function NextTopics({ meetings }: { meetings: RecentMeeting[] }) {
  let markdown = "";
  try {
    markdown = await suggestNextMeetingTopics(meetings);
  } catch (err) {
    return (
      <p className="muted">
        Couldn&apos;t generate suggestions:{" "}
        {err instanceof Error ? err.message : String(err)}
      </p>
    );
  }
  if (!markdown) return <p className="muted">No suggestions.</p>;
  return (
    <div className="summary">
      <Markdown>{markdown}</Markdown>
    </div>
  );
}

function TodoList({ items }: { items: TodoItem[] }) {
  if (items.length === 0) {
    return <p className="muted">No action items found.</p>;
  }
  return (
    <ul className="action-items">
      {items.map((t, i) => (
        <li key={`${t.meetingUrl}-${i}`}>
          <span className="checkbox">{t.completed ? "☑" : "☐"}</span>
          <span>
            {t.description}
            <span className="muted">
              {" — "}
              <a href={t.playbackUrl ?? t.meetingUrl} target="_blank" rel="noreferrer">
                {t.meetingTitle}
              </a>
              {t.meetingDate ? ` · ${t.meetingDate}` : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function TodosPage({
  params,
}: {
  params: Promise<{ email: string }>;
}) {
  const { email } = await params;

  let result;
  let error: string | null = null;
  try {
    result = await fetchTodos(email);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="page">
      <Link href="/" className="back-link">
        ← Today
      </Link>
      <header className="header">
        <h1>To-dos</h1>
        <p className="subtitle">Action items from your last 3 Fathom meetings</p>
      </header>

      {error && <p className="cal-error">{error}</p>}

      {result && (
        <>
          {result.recent.length > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              From:{" "}
              {result.recent.map((m, i) => (
                <span key={m.url}>
                  {i > 0 ? ", " : ""}
                  <a href={m.url} target="_blank" rel="noreferrer">
                    {m.title}
                  </a>
                  {m.date ? ` (${m.date})` : ""}
                </span>
              ))}
            </p>
          )}

          <section className="detail-section">
            <h2>Discuss in your next meeting</h2>
            <Suspense
              fallback={<p className="muted">Generating suggestions…</p>}
            >
              <NextTopics meetings={result.recent} />
            </Suspense>
          </section>

          <section className="detail-section">
            <h2>Your to-dos ({result.mine.length})</h2>
            <TodoList items={result.mine} />
          </section>

          <section className="detail-section">
            <h2>
              {result.clickedIsKaio
                ? `${result.clickedEmail} (that's you)`
                : `${result.clickedEmail} (${result.clicked.length})`}
            </h2>
            {result.clickedIsKaio ? (
              <p className="muted">
                You clicked your own email — see &ldquo;Your to-dos&rdquo; above.
              </p>
            ) : (
              <>
                <TodoList items={result.clicked} />
                <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                  Matched by name derived from the email (Fathom assigns action
                  items by name), so this may be incomplete.
                </p>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
