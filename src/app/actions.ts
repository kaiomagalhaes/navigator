"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, googleAccounts } from "@/db/schema";
import { getEvent } from "@/db/queries";
import { FathomApiError } from "@/lib/fathom";
import { findMeetingForEvent, type MatchableEvent } from "@/lib/fathom-meetings";
import { importCalendarRange, linkFathomRecording } from "@/lib/import-events";
import { regenerateEventTodos } from "@/lib/todos";
import { completeTask, TodoistApiError } from "@/lib/todoist";

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

export type ExtractTodosState = { error?: string; count?: number };

function describeOpenAiError(err: unknown): string {
  const e = err as { status?: number; message?: string };
  if (e?.message?.includes("OPENAI_API_KEY")) {
    return "OpenAI is not configured. Set OPENAI_API_KEY in your environment.";
  }
  if (e?.status === 401) {
    return "OpenAI rejected the API key. Check OPENAI_API_KEY in your environment.";
  }
  if (e?.status === 429) {
    return "OpenAI rate limit or quota reached. Please try again shortly.";
  }
  return "Could not extract to-dos. Please try again in a moment.";
}

// Extract action items from an event's transcript with OpenAI, tying each to a
// participant where possible. Regenerates the set on every run (delete-then-
// insert), so re-extracting replaces the previous to-dos rather than duplicating.
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

  try {
    const count = await regenerateEventTodos(event);
    revalidatePath(`/events/${event.id}`);
    return { count };
  } catch (err) {
    console.error("[extractEventTodos]", err);
    return { error: describeOpenAiError(err) };
  }
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
