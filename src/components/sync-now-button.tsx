"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { triggerSyncRun, type SyncRunState } from "@/app/actions";
import { SubmitButton } from "./submit-button";

const initialState: SyncRunState = {};

// "Run sync now" for the Activity page. Triggers a background sync run and, while
// one is in flight, shows a spinner and polls so the run's progress and result
// land without a manual refresh.
export function SyncNowButton({ running }: { running: boolean }) {
  const router = useRouter();
  const [state, formAction] = useActionState(triggerSyncRun, initialState);

  useEffect(() => {
    if (!running) return;
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      // Cap at ~20 min — a run shouldn't outlive that; stops a stuck poll.
      if (attempts > 240) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [running, router]);

  if (running) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        <span
          className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"
          aria-hidden
        />
        Syncing…
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <SubmitButton pendingLabel="Starting…">Run sync now</SubmitButton>
      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
