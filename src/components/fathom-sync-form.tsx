"use client";

import { useActionState } from "react";
import { syncEventWithFathom, type FathomSyncState } from "@/app/actions";
import { SubmitButton } from "./submit-button";

const initialState: FathomSyncState = {};

export function FathomSyncForm({ eventId }: { eventId: string }) {
  const [state, formAction] = useActionState(syncEventWithFathom, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <SubmitButton>Sync with Fathom</SubmitButton>
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.notFound && !state.error && (
        <p className="text-sm text-zinc-500">No matching Fathom recording found for this event.</p>
      )}
      {state.linkedTitle && !state.error && (
        <p className="text-sm text-green-700 dark:text-green-400">
          Linked “{state.linkedTitle}”.
        </p>
      )}
    </form>
  );
}
