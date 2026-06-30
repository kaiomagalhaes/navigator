"use client";

import { useActionState } from "react";
import { syncPeriod, type SyncActionState } from "./actions";

export function SyncControls({
  defaultStart,
  defaultEnd,
}: {
  defaultStart: string;
  defaultEnd: string;
}) {
  const [state, action, pending] = useActionState<SyncActionState | null, FormData>(
    syncPeriod,
    null,
  );

  return (
    <form action={action} className="sync-controls">
      <div className="sync-field">
        <label htmlFor="start">From</label>
        <input type="date" id="start" name="start" defaultValue={defaultStart} max={defaultEnd} />
      </div>
      <div className="sync-field">
        <label htmlFor="end">To</label>
        <input type="date" id="end" name="end" defaultValue={defaultEnd} max={defaultEnd} />
      </div>
      <button type="submit" disabled={pending}>
        {pending ? "Syncing…" : "Sync period"}
      </button>
      {state && (
        <span className={`sync-status ${state.ok ? "ok" : "error"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
