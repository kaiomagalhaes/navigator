"use server";

import { revalidatePath } from "next/cache";
import { syncMeetings } from "@/lib/sync/sync-meetings";
import { refreshTodayEvents, now } from "@/lib/calendar/daily";

export interface SyncActionState {
  ok: boolean;
  message: string;
}

/**
 * Server Action backing the daily view's "Refresh today's meetings" button.
 * Re-fetches today's calendar feeds, upserts events + people, and removes
 * events that disappeared from the feed (their people stay in the database).
 */
export async function refreshTodayCalendar(
  _prev: SyncActionState | null,
  _formData: FormData,
): Promise<SyncActionState> {
  try {
    const { events, errors, removed } = await refreshTodayEvents(now());
    revalidatePath("/");
    if (errors.length > 0) {
      return { ok: false, message: `Couldn't refresh: ${errors.join("; ")}` };
    }
    const removedNote =
      removed > 0
        ? `, removed ${removed} no longer on the calendar`
        : "";
    return {
      ok: true,
      message: `Refreshed ${events.length} meeting${events.length === 1 ? "" : "s"}${removedNote}.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

/**
 * Server Action backing the dashboard "Sync period" button. Parses the date
 * range (inclusive), runs the sync for that window, and refreshes the page.
 */
export async function syncPeriod(
  _prev: SyncActionState | null,
  formData: FormData,
): Promise<SyncActionState> {
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");

  if (!start || !end) {
    return { ok: false, message: "Pick both a start and end date." };
  }
  if (start > end) {
    return { ok: false, message: "Start date must be on or before end date." };
  }

  // Inclusive range: from the start of the start day to the end of the end day.
  const createdAfter = new Date(`${start}T00:00:00.000Z`).toISOString();
  const createdBefore = new Date(`${end}T23:59:59.999Z`).toISOString();

  try {
    const result = await syncMeetings({ createdAfter, createdBefore });
    revalidatePath("/");
    return {
      ok: true,
      message: `Synced ${result.matched} meeting${result.matched === 1 ? "" : "s"} (scanned ${result.fetched}) from ${start} to ${end}.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
