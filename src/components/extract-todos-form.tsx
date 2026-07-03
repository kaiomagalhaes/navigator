"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { extractEventTodos, type ExtractTodosState } from "@/app/actions";
import { SubmitButton } from "./submit-button";

const initialState: ExtractTodosState = {};

export function ExtractTodosForm({
  eventId,
  hasTodos,
  status,
  errorMessage,
}: {
  eventId: string;
  hasTodos: boolean;
  // Server-side extraction state, polled to completion. "running" while the
  // background LLM call is in flight, "error" if it failed, null when idle/done.
  status: "running" | "error" | null;
  errorMessage: string | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(extractEventTodos, initialState);
  const running = status === "running";

  // While extraction runs in the background, refresh the page every few seconds
  // so the to-dos appear (and the status flips) as soon as it finishes. A safety
  // cap stops polling if a run gets stuck (e.g. the dyno restarted mid-extract).
  useEffect(() => {
    if (!running) return;
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      if (attempts > 45) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [running, router]);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      {running ? (
        <span className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          <span
            className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"
            aria-hidden
          />
          Extracting to-dos… this can take a minute.
        </span>
      ) : (
        <SubmitButton pendingLabel="Starting…">
          {hasTodos ? "Re-extract to-dos" : "Extract to-dos"}
        </SubmitButton>
      )}

      {/* Immediate validation error from the trigger (e.g. no transcript). */}
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      {/* A failed background run — surface the stored error until re-run. */}
      {!running && status === "error" && !state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {errorMessage ?? "Extraction failed. Please try again."}
        </p>
      )}
    </form>
  );
}
