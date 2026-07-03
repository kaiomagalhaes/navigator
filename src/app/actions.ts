"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, googleAccounts, seriesPrepSettings, todos, workerRuns } from "@/db/schema";
import { startWorkerRun } from "@/lib/worker-runs";
import { runSync } from "@/lib/worker";
import { getEvent } from "@/db/queries";
import { FathomApiError } from "@/lib/fathom";
import { findMeetingForEvent, type MatchableEvent } from "@/lib/fathom-meetings";
import { importCalendarRange, linkFathomRecording } from "@/lib/import-events";
import { regenerateEventTodos } from "@/lib/todos";
import { generatePrep, describeOpenAiError, type PrepareState } from "@/lib/prepare";
import { completeTask, createTask, primaryProjectId, TodoistApiError } from "@/lib/todoist";
// Note: the Prepare types (PrepItem/PrepGroup/PrepareState/StoredPrep) are NOT
// re-exported here. Re-exporting types from a "use server" module makes Next's
// server-action compiler treat them as runtime action exports and blow up. All
// consumers import those types straight from "@/lib/prepare" instead.

// Events, people, and participants are sourced exclusively from the Google
// Calendar import (see importEvents) — there is no manual create/edit path.
// `linked` is how many events were auto-matched to a Fathom recording.
export type ImportState = { error?: string; imported?: number; people?: number; linked?: number };

// Turn a raw Google/Gaxios error into an actionable message. The failure mode
// matters: a disabled API is a Cloud-project config fix, not a reconnect.
function describeGoogleError(err: unknown): string {
  const e = err as {
    code?: number | string;
    response?: { status?: number; data?: { error?: { errors?: { reason?: string }[]; status?: string } } };
    errors?: { reason?: string }[];
  };
  const status = Number(e?.response?.status ?? e?.code);
  const reasons = new Set(
    [
      ...(e?.response?.data?.error?.errors ?? []),
      ...(e?.errors ?? []),
    ].map((x) => x?.reason)
  );
  const apiStatus = e?.response?.data?.error?.status;

  if (
    status === 403 &&
    (reasons.has("accessNotConfigured") || apiStatus === "PERMISSION_DENIED")
  ) {
    return "The Google Calendar API is disabled for this Google Cloud project. Enable it in the Google Cloud Console (APIs & Services → Library → Google Calendar API), wait a few minutes, then retry. Reconnecting the account will not help.";
  }
  if (status === 401 || reasons.has("invalid_grant") || apiStatus === "UNAUTHENTICATED") {
    return "Your Google connection has expired or was revoked. Disconnect and reconnect the account.";
  }
  return "Could not reach Google Calendar. Please try again in a moment.";
}

// Import meetings from a connected Google account into calendar_events/persons.
// Idempotent: re-importing the same window upserts events (by google_event_id)
// and people (by email) instead of duplicating them.
export async function importEvents(
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const accountId = String(formData.get("accountId") ?? "");
  const fromRaw = String(formData.get("from") ?? "");
  const toRaw = String(formData.get("to") ?? "");

  if (!accountId) return { error: "Choose a calendar to import from." };
  if (!fromRaw || !toRaw) return { error: "Pick a start and end date." };

  const from = new Date(`${fromRaw}T00:00:00`);
  const to = new Date(`${toRaw}T23:59:59`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { error: "Invalid date range." };
  }
  if (to < from) return { error: "End date must be on or after the start date." };

  const account = await db.query.googleAccounts.findFirst({
    where: eq(googleAccounts.id, accountId),
  });
  if (!account) return { error: "That calendar is no longer connected." };

  try {
    const summary = await importCalendarRange(account, from, to);
    revalidatePath("/events");
    revalidatePath("/people");
    revalidatePath("/calendars");
    return summary;
  } catch (err) {
    console.error("[importEvents]", err);
    return { error: describeGoogleError(err) };
  }
}

// ---- Fathom sync -----------------------------------------------------------

export type FathomSyncState = {
  error?: string;
  notFound?: boolean;
  linkedTitle?: string;
  url?: string | null;
};

function describeFathomError(err: unknown): string {
  if (err instanceof FathomApiError) {
    if (err.status === 401 || err.status === 403) {
      return "Fathom rejected the API key. Check FATHOM_API_KEY in your environment.";
    }
    if (err.status === 429) {
      return "Fathom rate limit reached (60 requests/minute). Please try again shortly.";
    }
  }
  return "Could not reach Fathom. Please try again in a moment.";
}

// Find the Fathom recording that corresponds to a calendar event and link it,
// storing the summary and transcript. Idempotent: re-syncing upserts the row.
export async function syncEventWithFathom(
  _prev: FathomSyncState,
  formData: FormData
): Promise<FathomSyncState> {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return { error: "Missing event." };

  const event = await getEvent(eventId);
  if (!event) return { error: "That event no longer exists." };

  const emails = [
    ...event.participants.map((p) => p.person.email.toLowerCase()),
    ...(event.organizerEmail ? [event.organizerEmail.toLowerCase()] : []),
  ];
  const matchable: MatchableEvent = { name: event.name, startsAt: event.startsAt, emails };

  let match;
  try {
    match = await findMeetingForEvent(matchable);
    if (!match) {
      return { notFound: true };
    }
    await linkFathomRecording(event.id, match);
  } catch (err) {
    console.error("[syncEventWithFathom]", err);
    return { error: describeFathomError(err) };
  }

  revalidatePath(`/events/${event.id}`);
  return { linkedTitle: match.title ?? "Fathom recording", url: match.shareUrl ?? match.url };
}

// ---- Extract to-dos --------------------------------------------------------

export type ExtractTodosState = { error?: string; started?: boolean };

// Kick off action-item extraction for an event's transcript. The OpenAI call can
// run well past Heroku's hard 30s request timeout (H12), so we DON'T do it inline:
// we mark the event "running", return immediately, and let `after` run the LLM
// work once the response has been sent. The event page polls todosExtractionStatus
// until it settles (null = done, "error" = failed). Regenerates the set on every
// run (delete-then-insert), so re-extracting replaces rather than duplicates.
export async function extractEventTodos(
  _prev: ExtractTodosState,
  formData: FormData
): Promise<ExtractTodosState> {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return { error: "Missing event." };

  const event = await getEvent(eventId);
  if (!event) return { error: "That event no longer exists." };

  const transcript = event.fathomRecording?.transcript;
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return { error: "This event has no transcript to extract to-dos from." };
  }

  // Mark it running so the re-rendered page shows the in-progress state and
  // starts polling. Clears any prior error.
  await db
    .update(calendarEvents)
    .set({ todosExtractionStatus: "running", todosExtractionError: null })
    .where(eq(calendarEvents.id, event.id));
  revalidatePath(`/events/${event.id}`);

  // Do the slow LLM work after the response is flushed — this is not bound by the
  // 30s router timeout. regenerateEventTodos persists the to-dos on success.
  after(async () => {
    try {
      await regenerateEventTodos(event);
      await db
        .update(calendarEvents)
        .set({ todosExtractionStatus: null, todosExtractionError: null })
        .where(eq(calendarEvents.id, event.id));
    } catch (err) {
      console.error("[extractEventTodos]", err);
      await db
        .update(calendarEvents)
        .set({ todosExtractionStatus: "error", todosExtractionError: describeOpenAiError(err) })
        .where(eq(calendarEvents.id, event.id));
    }
    revalidatePath(`/events/${event.id}`);
  });

  return { started: true };
}

// ---- Manual sync run -------------------------------------------------------

export type SyncRunState = { started?: boolean; alreadyRunning?: boolean; error?: string };

// Kick off a full sync run from the Activity page's "Run sync now" button. The
// job is long (30-day Fathom backfill), so it runs in the background via `after`
// and records a worker_runs row the page polls; the request returns immediately.
export async function triggerSyncRun(
  _prev: SyncRunState,
  _formData: FormData
): Promise<SyncRunState> {
  // Don't stack a second run on one already in flight — but ignore stale
  // "running" rows (>30 min old), so a crashed run can't block forever.
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const active = await db.query.workerRuns.findFirst({
    where: and(eq(workerRuns.status, "running"), gt(workerRuns.startedAt, cutoff)),
  });
  if (active) return { alreadyRunning: true };

  const run = await startWorkerRun("all");
  revalidatePath("/activity");
  after(async () => {
    try {
      await runSync("all", run);
    } catch (err) {
      console.error("[triggerSyncRun]", err);
    }
  });
  return { started: true };
}

// ---- Prepare for a meeting -------------------------------------------------

// Prep for a meeting from the event page's Prepare button. The gathering +
// coaching + persistence lives in @/lib/prepare (generatePrep) so the batch
// "prepare today" route can reuse it.
export async function prepareMeeting(
  _prev: PrepareState,
  formData: FormData
): Promise<PrepareState> {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) {
    console.warn("[prepareMeeting] aborted: no eventId in form data");
    return { error: "Missing event." };
  }
  return generatePrep(eventId);
}

// ---- Todoist -------------------------------------------------------------

export type CompleteTaskState = { error?: string };

function describeTodoistError(err: unknown): string {
  if (err instanceof TodoistApiError) {
    if (err.status === 401 || err.status === 403) {
      return "Todoist rejected the API token. Check TODOIST_API_TOKEN in your environment.";
    }
    if (err.status === 404) {
      return "That task no longer exists in Todoist.";
    }
  }
  if (err instanceof Error && err.message.includes("TODOIST_API_TOKEN")) {
    return "Todoist is not configured. Set TODOIST_API_TOKEN in your environment.";
  }
  return "Could not reach Todoist. Please try again in a moment.";
}

// Mark a Todoist task done from the To Dos page. Completing it in Todoist means
// it drops out of the "today | overdue" filter, so revalidating removes it here.
export async function completeTodoistTask(taskId: string): Promise<CompleteTaskState> {
  if (!taskId) return { error: "Missing task." };
  try {
    await completeTask(taskId);
    revalidatePath("/todos");
    return {};
  } catch (err) {
    console.error("[completeTodoistTask]", err);
    return { error: describeTodoistError(err) };
  }
}

// Copy a meeting to-do into Todoist, due today or tomorrow, then remember the
// created task id so the event page can show the to-do crossed off. No-ops if
// the to-do was already copied.
export async function copyMeetingTodoToTodoist(
  todoId: string,
  due: "today" | "tomorrow"
): Promise<CompleteTaskState> {
  if (!todoId) return { error: "Missing to-do." };
  if (due !== "today" && due !== "tomorrow") return { error: "Invalid due date." };

  const todo = await db.query.todos.findFirst({
    where: eq(todos.id, todoId),
    with: { event: { columns: { name: true } } },
  });
  if (!todo) return { error: "That to-do no longer exists." };
  if (todo.todoistTaskId) return {}; // already copied — nothing to do

  // Prefix with the meeting name for context, e.g. "Bill <> Codelitt - <task>".
  const content = `${todo.event.name} - ${todo.text}`;

  try {
    const task = await createTask({
      content,
      dueString: due,
      projectId: primaryProjectId(),
    });
    await db.update(todos).set({ todoistTaskId: task.id }).where(eq(todos.id, todoId));
    revalidatePath(`/events/${todo.eventId}`);
    revalidatePath("/todos");
    return {};
  } catch (err) {
    console.error("[copyMeetingTodoToTodoist]", err);
    return { error: describeTodoistError(err) };
  }
}

// Mark a meeting's to-dos as reviewed, hiding it from the To Dos page's "From
// your meetings" list. Pass reviewed=false to bring it back.
export async function setMeetingReviewed(
  eventId: string,
  reviewed: boolean
): Promise<{ error?: string }> {
  if (!eventId) return { error: "Missing meeting." };
  try {
    await db
      .update(calendarEvents)
      .set({ todosReviewedAt: reviewed ? new Date() : null })
      .where(eq(calendarEvents.id, eventId));
    revalidatePath("/todos");
    return {};
  } catch (err) {
    console.error("[setMeetingReviewed]", err);
    return { error: "Could not update the meeting. Please try again." };
  }
}

// Mark a recurring series as "skip prep" (or unmark it). When skipped, batch
// prep — the home page's first-visit auto-prep and the "Prep N meetings" button
// (both via /api/prepare-today) — ignores every occurrence of the series. It can
// still be prepared manually from the event page (prepareMeeting is unaffected).
export async function setSeriesSkipPrep(
  recurringEventId: string,
  skip: boolean
): Promise<{ error?: string }> {
  if (!recurringEventId) return { error: "Missing recurring meeting." };
  try {
    await db
      .insert(seriesPrepSettings)
      .values({ recurringEventId, skipPrep: skip })
      .onConflictDoUpdate({
        target: seriesPrepSettings.recurringEventId,
        set: { skipPrep: skip, updatedAt: new Date() },
      });
    revalidatePath("/");
    return {};
  } catch (err) {
    console.error("[setSeriesSkipPrep]", err);
    return { error: "Could not update the meeting. Please try again." };
  }
}

export async function disconnectAccount(formData: FormData): Promise<void> {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return;
  await db.delete(googleAccounts).where(eq(googleAccounts.id, accountId));
  revalidatePath("/calendars");
}

// Remove every imported event. Cascades to participants and Fathom recordings;
// people are left in place. Used by the "Delete all events" button.
export async function deleteAllEvents(): Promise<void> {
  await db.delete(calendarEvents);
  revalidatePath("/events");
  revalidatePath("/people");
}
