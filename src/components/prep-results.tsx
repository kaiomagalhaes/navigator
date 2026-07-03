import Link from "next/link";
import type { StoredPrep } from "@/lib/prepare";
import { formatDate } from "@/lib/format";

type Coaching = NonNullable<StoredPrep["coaching"]>;

// Renders a saved (or just-generated) Prepare result: the AI coaching briefing
// followed by the gathered action items grouped by person. Pure presentation —
// safe on the server (stored prep) and inside the client button component.
export function PrepResults({ data }: { data: StoredPrep }) {
  const hasItems = data.groups.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {data.extracted > 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Extracted to-dos from {data.extracted} earlier{" "}
          {data.extracted === 1 ? "meeting" : "meetings"}.
        </p>
      )}

      {data.coachingError && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Couldn&apos;t generate coaching ({data.coachingError}) — the items below are still up to date.
        </p>
      )}

      {data.coaching && <CoachingPanel coaching={data.coaching} />}

      {!hasItems && !data.coaching && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No action items from recent meetings with these people.
        </p>
      )}

      {hasItems && (
        <div className="flex flex-col gap-4">
          {data.groups.map((group) => (
            <div
              key={group.personId}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{group.name}</span>
                <span className="text-sm text-zinc-500">{group.email}</span>
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {group.items.map((item) => (
                  <li key={item.id} className="flex flex-col gap-0.5">
                    <span className={item.copied ? "text-sm text-zinc-400 line-through" : "text-sm"}>
                      {item.text}
                    </span>
                    <span className="text-xs text-zinc-500">
                      <Link href={`/events/${item.meetingId}`} className="hover:underline">
                        {item.meetingName}
                      </Link>{" "}
                      · {formatDate(item.meetingDate)}
                      {item.copied ? " · in Todoist" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The AI coaching briefing: summary, your own open commitments, topics to raise,
// and questions others are likely to ask you.
function CoachingPanel({ coaching }: { coaching: Coaching }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
      <div className="flex items-center gap-2">
        <span aria-hidden>🧭</span>
        <h3 className="font-medium">Your prep coach</h3>
      </div>

      {coaching.summary && (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{coaching.summary}</p>
      )}

      {coaching.myOpenItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Close these before the meeting
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {coaching.myOpenItems.map((item, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{item.text}</span>
                <span className="text-zinc-500 dark:text-zinc-400"> — {item.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {coaching.topics.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Topics to discuss
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {coaching.topics.map((topic, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{topic.title}</span>
                <span className="text-zinc-500 dark:text-zinc-400"> — {topic.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {coaching.anticipatedQuestions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            They may ask you about
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {coaching.anticipatedQuestions.map((q, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{q.from}:</span>{" "}
                <span className="text-zinc-700 dark:text-zinc-300">{q.question}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
