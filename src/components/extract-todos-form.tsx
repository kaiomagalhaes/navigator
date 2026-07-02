"use client";

import { useActionState } from "react";
import { extractEventTodos, type ExtractTodosState } from "@/app/actions";
import { SubmitButton } from "./submit-button";

const initialState: ExtractTodosState = {};

export function ExtractTodosForm({ eventId, hasTodos }: { eventId: string; hasTodos: boolean }) {
  const [state, formAction] = useActionState(extractEventTodos, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <SubmitButton>{hasTodos ? "Re-extract to-dos" : "Extract to-dos"}</SubmitButton>
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {typeof state.count === "number" && !state.error && (
        <p className="text-sm text-green-700 dark:text-green-400">
          {state.count === 0
            ? "No action items found in this transcript."
            : `Extracted ${state.count} to-do${state.count === 1 ? "" : "s"}.`}
        </p>
      )}
    </form>
  );
}
