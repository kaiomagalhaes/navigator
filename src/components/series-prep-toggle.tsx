"use client";

import { useState, useTransition } from "react";
import { setSeriesSkipPrep } from "@/app/actions";

// Per-series "skip auto-prep" toggle, shown on a recurring meeting's event page.
// When on, batch prep (the home page's first-visit auto-prep and the
// "Prep N meetings" button) ignores every occurrence of this series — but it can
// still be prepared manually with the Prepare button on this page.
export function SeriesPrepToggle({
  recurringEventId,
  initialSkip,
}: {
  recurringEventId: string;
  initialSkip: boolean;
}) {
  const [skip, setSkip] = useState(initialSkip);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !skip;
    setSkip(next); // optimistic
    startTransition(async () => {
      const res = await setSeriesSkipPrep(recurringEventId, next);
      if (res?.error) setSkip(!next); // revert on failure
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <span aria-hidden>🔁</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {skip ? "Auto-prep is off for this recurring meeting" : "Auto-prep is on for this recurring meeting"}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {skip
            ? "It's skipped when preparing a day's meetings — you can still prepare it manually here."
            : "It's included when preparing a day's meetings."}
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-white"
      >
        {pending ? "Saving…" : skip ? "Turn auto-prep on" : "Skip auto-prep"}
      </button>
    </div>
  );
}
