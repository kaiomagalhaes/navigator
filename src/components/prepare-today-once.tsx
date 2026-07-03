"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Remembers the last day we auto-prepared, so preparation runs only on the first
// visit to today's page per browser per day.
const STORAGE_KEY = "navigator:prepared-date";

// On the first visit to *today's* page each day, kick off preparing all of the
// day's meetings in the background (a POST that may take a while — it makes
// several OpenAI calls per meeting). When it finishes, refresh so the agenda's
// "Prepared" marks appear. No-ops on any day other than today.
export function PrepareTodayOnce({
  dateKey,
  isToday,
}: {
  dateKey: string;
  isToday: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const started = useRef(false);

  useEffect(() => {
    if (!isToday || started.current) return;

    let alreadyPrepared = false;
    try {
      alreadyPrepared = window.localStorage.getItem(STORAGE_KEY) === dateKey;
    } catch {
      // No storage access — fall through and prepare (worst case: runs again,
      // but the server skips meetings that are already prepared).
    }
    if (alreadyPrepared) return;

    started.current = true;
    setStatus("running");
    (async () => {
      try {
        const res = await fetch(`/api/prepare-today?date=${dateKey}`, { method: "POST" });
        if (!res.ok) {
          started.current = false; // let a later visit retry
          setStatus("idle");
          return;
        }
        try {
          window.localStorage.setItem(STORAGE_KEY, dateKey);
        } catch {
          // Ignore storage failures — preparation still succeeded server-side.
        }
        setStatus("done");
        router.refresh();
      } catch {
        started.current = false; // network hiccup — allow a retry on next visit
        setStatus("idle");
      }
    })();
  }, [dateKey, isToday, router]);

  if (status !== "running") return null;

  return (
    <span className="text-xs text-zinc-400 dark:text-zinc-500">
      Preparing today&apos;s meetings…
    </span>
  );
}
