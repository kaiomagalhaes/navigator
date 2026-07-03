import "server-only";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents } from "@/db/schema";
import { getEvent, listRecentMeetingsWithPerson } from "@/db/queries";
import { regenerateEventTodos } from "@/lib/todos";
import { coachMeeting, type CoachTodo, type MeetingCoaching } from "@/lib/meeting-coach";
import { isMe } from "@/lib/me";

// One outstanding action item surfaced for meeting prep, with the meeting it
// came from so the prep view can link back and show recency.
export type PrepItem = {
  id: string;
  text: string;
  meetingId: string;
  meetingName: string;
  // Date when freshly generated; an ISO string once round-tripped through the
  // stored jsonb. formatDate() handles both.
  meetingDate: Date | string;
  copied: boolean; // already sent to Todoist
};

export type PrepGroup = {
  personId: string;
  name: string;
  email: string;
  items: PrepItem[];
};

// `extracted` is how many past meetings we had to extract to-dos from on the fly.
// `coaching` is the AI prep briefing; `coachingError` is set (with groups still
// returned) when the coaching call fails but the item gathering succeeded.
export type PrepareState = {
  error?: string;
  ran?: boolean;
  extracted?: number;
  groups?: PrepGroup[];
  coaching?: MeetingCoaching;
  coachingError?: string;
};

// The Prepare result as persisted on calendar_events.prep and re-rendered on the
// event page. Dates inside `groups` are ISO strings after the jsonb round-trip.
export type StoredPrep = {
  generatedAt: string;
  extracted: number;
  groups: PrepGroup[];
  coaching?: MeetingCoaching;
  coachingError?: string;
};

export function describeOpenAiError(err: unknown): string {
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

// Persist a Prepare result to the event and refresh the pages that display it:
// the event page (button → stored briefing) and the home agenda (adds the
// "Prepared" mark).
async function storePrep(eventId: string, prep: StoredPrep): Promise<void> {
  await db.update(calendarEvents).set({ prep }).where(eq(calendarEvents.id, eventId));
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/");
}

// Prep for a meeting: for each attendee, look at their last 3 past meetings,
// extract to-dos from any that have a transcript but weren't extracted yet, then
// surface every action item assigned to someone who's also in this meeting, and
// coach the user through it. Best-effort extraction — an OpenAI failure aborts
// with a message. Shared by the Prepare action and the batch "prepare today".
export async function generatePrep(eventId: string): Promise<PrepareState> {
  const startedAt = Date.now();
  const current = await getEvent(eventId);
  if (!current) {
    console.warn(`[prepareMeeting] aborted: event ${eventId} not found`);
    return { error: "That event no longer exists." };
  }

  console.log(
    `[prepareMeeting] start "${current.name}" (${eventId}) — ${current.participants.length} attendee(s)`
  );

  // Who's in this meeting — we only surface to-dos assigned to these people.
  const attendeeEmails = new Set(current.participants.map((p) => p.person.email.toLowerCase()));
  if (attendeeEmails.size === 0) {
    console.log(`[prepareMeeting] no attendees on "${current.name}" — nothing to prepare`);
    await storePrep(eventId, { generatedAt: new Date().toISOString(), extracted: 0, groups: [] });
    return { ran: true, extracted: 0, groups: [] };
  }

  // Union of each attendee's last 3 past meetings (this event excluded). For a
  // recurring meeting, restrict that history to prior occurrences of the same
  // series — matched by series id or identical name (so older, untagged
  // occurrences still count). For a one-off it's null → any meetings.
  const series = current.recurringEventId
    ? { id: current.recurringEventId, name: current.name }
    : null;
  if (series) {
    console.log(
      `[prepareMeeting] recurring "${current.name}" (series ${current.recurringEventId}) — scoping history to this series`
    );
  }
  const meetingIds = new Set<string>();
  await Promise.all(
    current.participants.map(async ({ person }) => {
      const recent = await listRecentMeetingsWithPerson(person.id, eventId, 3, series);
      console.log(
        `[prepareMeeting]   ${person.name} <${person.email}> → ${recent.length} recent meeting(s)`
      );
      recent.forEach((m) => meetingIds.add(m.id));
    })
  );
  console.log(
    `[prepareMeeting] ${meetingIds.size} unique past meeting(s) to review across all attendees`
  );
  if (meetingIds.size === 0) {
    console.log(`[prepareMeeting] done in ${Date.now() - startedAt}ms — no history with these people`);
    await storePrep(eventId, { generatedAt: new Date().toISOString(), extracted: 0, groups: [] });
    return { ran: true, extracted: 0, groups: [] };
  }

  let meetings = await Promise.all([...meetingIds].map((id) => getEvent(id)));

  // Extract to-dos for any transcript-bearing meeting we haven't processed yet.
  let extracted = 0;
  try {
    for (const meeting of meetings) {
      if (!meeting) continue;
      const transcript = meeting.fathomRecording?.transcript;
      const hasTranscript = Array.isArray(transcript) && transcript.length > 0;
      // Extract only once per meeting: skip when already extracted (even to zero
      // to-dos) or when to-dos already exist from an earlier extraction.
      const needsExtraction =
        hasTranscript && meeting.todosExtractedAt === null && meeting.todos.length === 0;
      if (needsExtraction) {
        console.log(`[prepareMeeting]   extracting to-dos from "${meeting.name}" (${meeting.id})…`);
        const at = Date.now();
        const count = await regenerateEventTodos(meeting);
        extracted++;
        console.log(
          `[prepareMeeting]   extracted ${count} to-do(s) from "${meeting.name}" in ${Date.now() - at}ms`
        );
      } else if (!hasTranscript) {
        console.log(`[prepareMeeting]   skip "${meeting.name}" — no Fathom transcript`);
      } else {
        console.log(
          `[prepareMeeting]   skip "${meeting.name}" — already extracted (${meeting.todos.length} existing to-do(s))`
        );
      }
    }
  } catch (err) {
    console.error(`[prepareMeeting] extraction failed after ${Date.now() - startedAt}ms:`, err);
    return { error: describeOpenAiError(err) };
  }

  // Re-read the meetings we just extracted so their fresh to-dos are included.
  if (extracted > 0) {
    meetings = await Promise.all([...meetingIds].map((id) => getEvent(id)));
  }

  // Group the matching to-dos by assignee (only people also in this meeting).
  const groups = new Map<string, PrepGroup>();
  let itemCount = 0;
  for (const meeting of meetings) {
    if (!meeting) continue;
    for (const todo of meeting.todos) {
      if (!todo.person) continue;
      if (!attendeeEmails.has(todo.person.email.toLowerCase())) continue;
      const group = groups.get(todo.person.id) ?? {
        personId: todo.person.id,
        name: todo.person.name,
        email: todo.person.email,
        items: [],
      };
      group.items.push({
        id: todo.id,
        text: todo.text,
        meetingId: meeting.id,
        meetingName: meeting.name,
        meetingDate: meeting.startsAt,
        copied: Boolean(todo.todoistTaskId),
      });
      groups.set(todo.person.id, group);
      itemCount++;
    }
  }

  // Coach the user through the meeting from the gathered items (best-effort: a
  // coaching failure still returns the item list). Skip when there's nothing to
  // work from.
  let coaching: MeetingCoaching | undefined;
  let coachingError: string | undefined;
  if (itemCount > 0) {
    const myItems: CoachTodo[] = [];
    const othersItems: (CoachTodo & { person: string })[] = [];
    for (const group of groups.values()) {
      const mine = isMe(group.email);
      for (const item of group.items) {
        const todo: CoachTodo = {
          text: item.text,
          sourceMeeting: item.meetingName,
          sentToTodoist: item.copied,
        };
        if (mine) myItems.push(todo);
        else othersItems.push({ ...todo, person: group.name });
      }
    }

    console.log(
      `[prepareMeeting] coaching: asking AI (${myItems.length} of mine, ${othersItems.length} others')…`
    );
    const at = Date.now();
    try {
      coaching = await coachMeeting({
        meetingName: current.name,
        meetingDate: current.startsAt.toISOString().slice(0, 10),
        attendees: current.participants.map((p) => ({
          name: p.person.name,
          isMe: isMe(p.person.email),
        })),
        myItems,
        othersItems,
      });
      console.log(
        `[prepareMeeting] coaching: ${coaching.topics.length} topic(s), ${coaching.myOpenItems.length} open item(s), ` +
          `${coaching.anticipatedQuestions.length} anticipated question(s) in ${Date.now() - at}ms`
      );
    } catch (err) {
      console.error(`[prepareMeeting] coaching failed after ${Date.now() - at}ms:`, err);
      coachingError = describeOpenAiError(err);
    }
  }

  console.log(
    `[prepareMeeting] done in ${Date.now() - startedAt}ms — ${extracted} meeting(s) extracted, ` +
      `${itemCount} item(s) across ${groups.size} of ${current.participants.length} attendee(s)`
  );

  const sortedGroups = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  await storePrep(eventId, {
    generatedAt: new Date().toISOString(),
    extracted,
    groups: sortedGroups,
    coaching,
    coachingError,
  });

  return { ran: true, extracted, groups: sortedGroups, coaching, coachingError };
}
