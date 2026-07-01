"use client";

import { useActionState } from "react";
import { refreshTodayCalendar, type SyncActionState } from "./actions";

export function RefreshToday() {
  const [state, action, pending] = useActionState<
    SyncActionState | null,
    FormData
  >(refreshTodayCalendar, null);

  return (
    <form action={action} className="refresh-today">
      <button type="submit" disabled={pending}>
        {pending ? "Refreshing…" : "Refresh today's meetings"}
      </button>
      {state && (
        <span className={`sync-status ${state.ok ? "ok" : "error"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
