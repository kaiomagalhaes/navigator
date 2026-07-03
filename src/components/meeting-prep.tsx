"use client";

import Link from "next/link";
import { useActionState } from "react";
import { prepareMeeting, type PrepareState } from "@/app/actions";
import { formatDate } from "@/lib/format";
import { SubmitButton } from "./submit-button";

const initialState: PrepareState = {};

// "Prepare" for an upcoming meeting: pulls open action items from recent
// meetings with the same people, extracting any that weren't processed yet.
export function MeetingPrep({ eventId }: { eventId: string }) {
  const [state, formAction] = useActionState(prepareMeeting, initialState);
  const hasResults = state.ran && !state.error && (state.groups?.length ?? 0) > 0;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Prepare for this meeting</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Pull action items from recent meetings with the people you&apos;re about to meet.
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton pendingLabel="Preparing…">Prepare</SubmitButton>
        </form>
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      {state.ran && !state.error && (state.extracted ?? 0) > 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Extracted to-dos from {state.extracted} earlier{" "}
          {state.extracted === 1 ? "meeting" : "meetings"}.
        </p>
      )}

      {state.ran && !state.error && !hasResults && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No action items from recent meetings with these people.
        </p>
      )}

      {hasResults && (
        <div className="flex flex-col gap-4">
          {state.groups!.map((group) => (
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
    </section>
  );
}
