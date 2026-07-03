"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 60_000; // pull the day from Google once a minute

function formatSyncedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Keeps the selected day fresh: polls /api/day-sync every minute in the
// background and, only when the sync reports a real change, refreshes the
// server-rendered agenda. Also shows when the day was last synced. Polling
// pauses while the tab is hidden and resumes (with an immediate poll) on return.
export function DayLiveSync({
  dateKey,
  initialSyncedAt,
}: {
  dateKey: string;
  initialSyncedAt: string | null;
}) {
  const router = useRouter();
  const [syncedAt, setSyncedAt] = useState<string | null>(initialSyncedAt);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current || (typeof document !== "undefined" && document.hidden)) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/day-sync?date=${dateKey}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: { changed: boolean; lastSyncedAt: string } = await res.json();
      setSyncedAt(data.lastSyncedAt);
      if (data.changed) router.refresh();
    } catch {
      // Network hiccup — leave the last-synced label as-is and try again next tick.
    } finally {
      inFlight.current = false;
    }
  }, [dateKey, router]);

  // Reset the displayed timestamp when the selected day changes.
  useEffect(() => {
    setSyncedAt(initialSyncedAt);
  }, [dateKey, initialSyncedAt]);

  useEffect(() => {
    poll(); // fetch fresh data as soon as the day is shown
    const interval = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  return (
    <span
      suppressHydrationWarning
      className="text-xs text-zinc-400 dark:text-zinc-500"
      title="This day auto-refreshes every minute"
    >
      {syncedAt ? `Last updated at ${formatSyncedAt(syncedAt)}` : "Updating…"}
    </span>
  );
}
