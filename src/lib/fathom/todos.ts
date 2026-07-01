// Fetches action items from the last few meetings live from Fathom (MCP) and
// groups them into Kaio's items and the clicked participant's items.
//
// Fathom assigns action items by NAME. Kaio's identities are matched precisely
// (config); the clicked participant is matched best-effort by deriving a name
// from the clicked email/identifier.
import { connectForSync, callTool, textOf } from "@/lib/fathom/mcp/client";
import { parseListPage } from "@/lib/fathom/mcp/parse";
import { isTargetToken } from "@/lib/fathom/config";

const RECENT_MEETINGS = 3;

export interface TodoItem {
  description: string;
  completed: boolean;
  assigneeName: string | null;
  meetingTitle: string;
  meetingUrl: string;
  meetingDate: string | null;
  playbackUrl: string | null;
  timestamp: string | null;
}

export interface RecentMeeting {
  title: string;
  date: string | null;
  url: string;
  summary: string | null;
  actionItems: {
    description: string;
    assigneeName: string | null;
    completed: boolean;
  }[];
}

export interface TodoResult {
  clickedEmail: string;
  clickedIsKaio: boolean;
  recent: RecentMeeting[];
  mine: TodoItem[];
  clicked: TodoItem[];
}

/** A person we want to prepare for, identified by whatever we have on file. */
export interface PersonRef {
  name: string | null;
  email: string | null;
}

/** One of the person's recent meetings with Kaio, with its action items. */
export interface MeetingTodos {
  title: string;
  date: string | null;
  url: string;
  items: {
    description: string;
    completed: boolean;
    assigneeName: string | null;
    /** True when this item was assigned to the person we're preparing for. */
    assignedToPerson: boolean;
    playbackUrl: string | null;
  }[];
}

export interface PersonTodosResult {
  person: PersonRef;
  meetings: MeetingTodos[];
}

/**
 * Fold to a diacritic-free, lowercase, letters-only form so accented names
 * match their unaccented email spellings — e.g. "Guimarães" → "guimaraes",
 * matching the local part of pedro.guimaraes@… (without folding, the ã is
 * dropped, yielding "guimares" and a missed match).
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Best-effort: does this email/identifier look like this name? */
function matchesName(identifier: string, name: string | null): boolean {
  if (!name) return false;
  const nameNorm = fold(name);
  if (!nameNorm) return false;
  const local = identifier
    .split("@")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const tokens = local.split(/[._\-\s]+/).filter((t) => t.length >= 2);
  if (tokens.length >= 2) return tokens.every((t) => nameNorm.includes(t));
  const single = local.replace(/[^a-z]/g, "");
  return single.length >= 3 && nameNorm.includes(single);
}

/**
 * Does a meeting recorder/invitee token (name or email) refer to this person?
 * Fathom usually lists attendees by display name, so we resolve the person's
 * email to name tokens and match those, in addition to exact email/name.
 */
function personMatchesToken(person: PersonRef, token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (person.email && t.toLowerCase() === person.email.toLowerCase()) return true;
  if (person.name && fold(t) && fold(t) === fold(person.name)) return true;
  if (t.includes("@")) return matchesName(t, person.name);
  if (person.email) return matchesName(person.email, t);
  return false;
}

/**
 * Was this action item (assigned by name in Fathom) handed to this person?
 * The assignee name varies ("Pedro Vieira Guimarães", "Pedro Guimaraes
 * (Codelitt)"), so we match the person's email-derived name tokens as well as
 * an exact folded name.
 */
function assignedToPerson(
  person: PersonRef,
  assigneeName: string | null,
): boolean {
  if (!assigneeName) return false;
  if (person.name && fold(assigneeName) === fold(person.name)) return true;
  if (person.email) return matchesName(person.email, assigneeName);
  return false;
}

/**
 * The person's last few meetings that a Kaio identity also attended, most
 * recent first, with each meeting's action items. Gives Kaio visibility into
 * what was agreed with this person so he can prepare for their next
 * conversation. Fetched live from Fathom (MCP).
 *
 * Attendance is matched by resolving the person to name/email tokens (Fathom
 * lists most attendees by display name, not email), so a person with neither a
 * name nor an email on file matches nothing.
 */
export async function fetchPersonMeetingTodos(
  person: PersonRef,
): Promise<PersonTodosResult> {
  if (!person.email && !person.name) return { person, meetings: [] };

  const session = await connectForSync();
  try {
    const recent: ReturnType<typeof parseListPage>["meetings"] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const res = await callTool(session.client, "list_meetings", {
        include_action_items: true,
        include_summary: true,
        ...(cursor ? { cursor } : {}),
      });
      const { meetings, nextCursor } = parseListPage(textOf(res));
      for (const m of meetings) {
        const kaioAttended =
          isTargetToken(m.recorderName) || m.invitees.some(isTargetToken);
        const personAttended =
          personMatchesToken(person, m.recorderName ?? "") ||
          m.invitees.some((t) => personMatchesToken(person, t));
        if (kaioAttended && personAttended) {
          recent.push(m);
          if (recent.length >= RECENT_MEETINGS) break;
        }
      }
      cursor = nextCursor ?? undefined;
      pages++;
    } while (recent.length < RECENT_MEETINGS && cursor && pages < 10);

    return {
      person,
      meetings: recent.map((m) => ({
        title: m.title,
        date: m.date,
        url: m.url,
        items: m.actionItems.map((a) => ({
          description: a.description,
          completed: a.completed,
          assigneeName: a.assigneeName,
          assignedToPerson: assignedToPerson(person, a.assigneeName),
          playbackUrl: a.recordingPlaybackUrl,
        })),
      })),
    };
  } finally {
    await session.close();
  }
}

export async function fetchTodos(clickedEmail: string): Promise<TodoResult> {
  const clickedIsKaio = isTargetToken(clickedEmail);
  const session = await connectForSync();
  try {
    // Collect Kaio's last few meetings (recorded or attended), most-recent
    // first. list_meetings returns newest first; page until we have enough.
    const recent: ReturnType<typeof parseListPage>["meetings"] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const res = await callTool(session.client, "list_meetings", {
        include_action_items: true,
        include_summary: true,
        ...(cursor ? { cursor } : {}),
      });
      const { meetings, nextCursor } = parseListPage(textOf(res));
      for (const m of meetings) {
        if (isTargetToken(m.recorderName) || m.invitees.some(isTargetToken)) {
          recent.push(m);
          if (recent.length >= RECENT_MEETINGS) break;
        }
      }
      cursor = nextCursor ?? undefined;
      pages++;
    } while (recent.length < RECENT_MEETINGS && cursor && pages < 5);

    const mine: TodoItem[] = [];
    const clicked: TodoItem[] = [];

    for (const m of recent) {
      for (const a of m.actionItems) {
        const item: TodoItem = {
          description: a.description,
          completed: a.completed,
          assigneeName: a.assigneeName,
          meetingTitle: m.title,
          meetingUrl: m.url,
          meetingDate: m.date,
          playbackUrl: a.recordingPlaybackUrl,
          timestamp: a.recordingTimestamp,
        };
        if (isTargetToken(a.assigneeName)) mine.push(item);
        if (!clickedIsKaio && matchesName(clickedEmail, a.assigneeName)) {
          clicked.push(item);
        }
      }
    }

    return {
      clickedEmail,
      clickedIsKaio,
      recent: recent.map((m) => ({
        title: m.title,
        date: m.date,
        url: m.url,
        summary: m.summaryMarkdown,
        actionItems: m.actionItems.map((a) => ({
          description: a.description,
          assigneeName: a.assigneeName,
          completed: a.completed,
        })),
      })),
      mine,
      clicked,
    };
  } finally {
    await session.close();
  }
}
