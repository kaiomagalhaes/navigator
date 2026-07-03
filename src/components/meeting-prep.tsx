"use client";

import { useActionState } from "react";
import { prepareMeeting, type PrepareState } from "@/app/actions";
import { SubmitButton } from "./submit-button";

const initialState: PrepareState = {};

// The "Prepare" trigger for an upcoming meeting. On click it gathers action
// items from recent meetings, runs AI coaching, and SAVES the result to the
// event — which revalidates the page so the saved briefing replaces this button.
export function MeetingPrep({ eventId }: { eventId: string }) {
  const [state, formAction] = useActionState(prepareMeeting, initialState);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Prepare for this meeting</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Pull action items from recent meetings with these people and get AI coaching. Saved once
            generated.
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton pendingLabel="Preparing…">Prepare</SubmitButton>
        </form>
      </div>

      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </section>
  );
}
