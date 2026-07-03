"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Manual "prep this day's meetings" button, shown on days other than today
// (today prepares itself on first visit — see PrepareTodayOnce). Preps every
// not-yet-prepared meeting on the day via the same background route, then
// refreshes so the agenda's "Prepared" marks appear.
export function PrepareDayButton({
  dateKey,
  count,
}: {
  dateKey: string;
  count: number;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function prepare() {
    if (running) return;
    setRunning(true);
    try {
      const res = await fetch(`/api/prepare-today?date=${dateKey}`, { method: "POST" });
      if (res.ok) router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <button
      type="button"
      onClick={prepare}
      disabled={running}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-white"
    >
      {running
        ? "Preparing…"
        : count === 1
          ? "Prep 1 meeting"
          : `Prep ${count} meetings`}
    </button>
  );
}
