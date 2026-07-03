"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toDateParam } from "@/lib/format";

// Where the last-picked day is remembered between visits.
const STORAGE_KEY = "navigator:selected-date";

// Shift a "YYYY-MM-DD" string by whole days, staying in local time.
function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d);
  next.setDate(next.getDate() + days);
  return toDateParam(next);
}

const btnClass =
  "flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-white text-lg text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-white";

// Day selector for the home page. Reflects the chosen day in the URL (?date=),
// so the server component re-renders for that day. Landing on today drops the
// param, keeping "/" canonical.
export function DateNav({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const go = (value: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore storage failures (private mode, quota) — navigation still works.
    }
    router.push(value === today ? "/" : `/?date=${value}`);
  };

  // On a fresh load with no explicit day in the URL, restore the last one the
  // user picked. Runs once on mount; in-app date changes update `date` without
  // remounting, so this never fights an active navigation.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // No storage access — nothing to restore.
    }
    if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored) && stored !== date) {
      router.replace(stored === today ? "/" : `/?date=${stored}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-2">
      {date !== today && (
        <button
          type="button"
          className="mr-1 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          onClick={() => go(today)}
        >
          Today
        </button>
      )}
      <button type="button" aria-label="Previous day" className={btnClass} onClick={() => go(shiftDay(date, -1))}>
        ‹
      </button>
      <input
        type="date"
        value={date}
        aria-label="Pick a day"
        onChange={(e) => {
          if (e.target.value) go(e.target.value);
        }}
        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
      />
      <button type="button" aria-label="Next day" className={btnClass} onClick={() => go(shiftDay(date, 1))}>
        ›
      </button>
    </div>
  );
}
