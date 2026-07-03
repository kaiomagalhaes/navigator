import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvent, listRecentMeetingsWithPerson } from "@/db/queries";
import { formatDate, formatDateTime } from "@/lib/format";
import { FathomSyncForm } from "@/components/fathom-sync-form";
import { ExtractTodosForm } from "@/components/extract-todos-form";
import { TranscriptViewer } from "@/components/transcript-viewer";
import { MeetingTodo } from "@/components/meeting-todo";
import { isMe } from "@/lib/me";
import type { FathomTranscriptEntry } from "@/lib/fathom-meetings";

// "HH:MM:SS" / "MM:SS" / "SS" → total seconds, or null if unparseable.
function timestampToSeconds(ts: string): number | null {
  const parts = ts.split(":").map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) {
    notFound();
  }

  // Hide yourself — the list should read as "who else was in this meeting".
  const participants = event.participants
    .filter(({ person }) => !isMe(person.email))
    .sort((a, b) => a.person.name.localeCompare(b.person.name));

  // For each attendee, the last few meetings we've had with them (this event
  // excluded), so you can jump straight into the recent history / transcripts.
  const recentByPerson = await Promise.all(
    participants.map(({ person }) => listRecentMeetingsWithPerson(person.id, event.id))
  );

  // Fathom only has recordings for meetings that have already happened, so the
  // "Sync with Fathom" action makes no sense for an event still in the future.
  const isUpcoming = event.startsAt > new Date();

  const recording = event.fathomRecording;
  const transcript = (recording?.transcript ?? null) as FathomTranscriptEntry[] | null;
  const hasTranscript = !!transcript && transcript.length > 0;

  // Resolve a to-do's stored transcript timestamp to a transcript line index so
  // the to-do can deep-link to "#ts-<index>". Prefer an exact timestamp match;
  // otherwise fall back to the nearest line by elapsed seconds. Returns null
  // when there's no transcript or no timestamp to anchor to.
  const resolveTsIndex = (ts: string | null): number | null => {
    if (!ts || !transcript) return null;
    // Tolerate stray formatting (e.g. "[00:19:02]") from older data.
    const clean = ts.replace(/[^\d:]/g, "");
    if (!clean) return null;
    const exact = transcript.findIndex((e) => e.timestamp.replace(/[^\d:]/g, "") === clean);
    if (exact >= 0) return exact;
    const target = timestampToSeconds(clean);
    if (target === null) return null;
    let best: number | null = null;
    let bestDiff = Infinity;
    transcript.forEach((e, i) => {
      const s = timestampToSeconds(e.timestamp);
      if (s !== null) {
        const diff = Math.abs(s - target);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = i;
        }
      }
    });
    return best;
  };

  // Group extracted to-dos by the person responsible, with an "Unassigned"
  // bucket for action items we couldn't tie to a known participant.
  const todosByPerson = new Map<
    string,
    { name: string; email: string; items: typeof event.todos }
  >();
  const unassignedTodos: typeof event.todos = [];
  for (const todo of event.todos) {
    if (todo.person) {
      const group = todosByPerson.get(todo.person.id) ?? {
        name: todo.person.name,
        email: todo.person.email,
        items: [],
      };
      group.items.push(todo);
      todosByPerson.set(todo.person.id, group);
    } else {
      unassignedTodos.push(todo);
    }
  }
  const todoGroups = [...todosByPerson.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/events" className="text-sm text-zinc-500 hover:underline">
            ← Events
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{event.name}</h1>
        </div>
        {!isUpcoming && <FathomSyncForm eventId={event.id} />}
      </div>

      <dl className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Starts</dt>
          <dd className="mt-1 font-medium">{formatDateTime(event.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Ends</dt>
          <dd className="mt-1 font-medium">{formatDateTime(event.endsAt)}</dd>
        </div>
      </dl>

      {recording && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium">Fathom recording</h2>
            {(recording.shareUrl || recording.url) && (
              <a
                href={recording.shareUrl ?? recording.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-zinc-900 underline dark:text-white"
              >
                View in Fathom ↗
              </a>
            )}
          </div>

          {recording.summary && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-xs uppercase tracking-wide text-zinc-500">Summary</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm">{recording.summary}</p>
            </div>
          )}

          {hasTranscript && (
            <ExtractTodosForm eventId={event.id} hasTodos={event.todos.length > 0} />
          )}

          {hasTranscript && <TranscriptViewer entries={transcript} />}
        </section>
      )}

      {event.todos.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">To-dos ({event.todos.length})</h2>
          <div className="flex flex-col gap-4">
            {todoGroups.map((group) => (
              <div
                key={group.email}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{group.name}</span>
                  <span className="text-sm text-zinc-500">{group.email}</span>
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {group.items.map((todo) => (
                    <MeetingTodo
                      key={todo.id}
                      todoId={todo.id}
                      text={todo.text}
                      tsIndex={resolveTsIndex(todo.transcriptTimestamp)}
                      copied={Boolean(todo.todoistTaskId)}
                    />
                  ))}
                </ul>
              </div>
            ))}

            {unassignedTodos.length > 0 && (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
                <p className="text-sm font-medium text-zinc-500">Unassigned</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {unassignedTodos.map((todo) => (
                    <MeetingTodo
                      key={todo.id}
                      todoId={todo.id}
                      text={todo.text}
                      tsIndex={resolveTsIndex(todo.transcriptTimestamp)}
                      assigneeName={todo.assigneeName}
                      copied={Boolean(todo.todoistTaskId)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">
          Attendees ({participants.length})
        </h2>

        {participants.length === 0 ? (
          <p className="text-sm text-zinc-500">No attendees on this event.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {participants.map(({ person }, i) => {
              const recent = recentByPerson[i];
              return (
                <li
                  key={person.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <Link
                    href={`/people/${person.id}`}
                    className="inline-flex items-baseline gap-2 hover:underline"
                  >
                    <span className="font-medium">{person.name}</span>
                    <span className="text-sm text-zinc-500">{person.email}</span>
                  </Link>

                  <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800/60">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      {recent.length > 0
                        ? `Last ${recent.length} meeting${recent.length === 1 ? "" : "s"} together`
                        : "Recent meetings together"}
                    </p>
                    {recent.length === 0 ? (
                      <p className="mt-2 text-sm text-zinc-500">
                        No earlier meetings with them yet.
                      </p>
                    ) : (
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {recent.map((meeting) => (
                          <li key={meeting.id}>
                            <Link
                              href={`/events/${meeting.id}`}
                              className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                            >
                              <span className="flex items-center gap-2 truncate">
                                <span className="truncate font-medium">{meeting.name}</span>
                                {meeting.fathomRecording && (
                                  <span
                                    className="shrink-0 text-green-600 dark:text-green-400"
                                    title="Has a Fathom transcript"
                                    aria-label="Has a Fathom transcript"
                                  >
                                    ●
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-xs text-zinc-500">
                                {formatDate(meeting.startsAt)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
