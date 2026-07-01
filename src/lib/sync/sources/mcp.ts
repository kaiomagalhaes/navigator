// MCP meeting source: pulls from the Fathom MCP server (text output, parsed)
// using stored OAuth credentials. Keeps meetings where a target identity is the
// recorder (email-precise via the recorded_by filter) or appears as a recorder/
// invitee by name. Transcripts are fetched per meeting via get_meeting_transcript.
//
// Fidelity note: the MCP exposes recorders/invitees by NAME (emails only
// sometimes), and has no scheduled/recording timestamps or invitee is_external
// flags — those land null. Attendance matching is therefore by name.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectForSync, callTool, textOf } from "@/lib/fathom/mcp/client";
import { TARGET_EMAILS, isTargetToken } from "@/lib/fathom/config";
import {
  parseListPage,
  parseTranscript,
  type ParsedListMeeting,
} from "@/lib/fathom/mcp/parse";
import type {
  NormalizedMeeting,
  NormalizedParticipant,
} from "@/lib/sync/types";

/** Page through list_meetings, parsing each page. */
async function listAll(
  client: Client,
  args: Record<string, unknown>,
): Promise<ParsedListMeeting[]> {
  const all: ParsedListMeeting[] = [];
  let cursor: string | undefined;
  do {
    const res = await callTool(client, "list_meetings", {
      ...args,
      ...(cursor ? { cursor } : {}),
    });
    const { meetings, nextCursor } = parseListPage(textOf(res));
    all.push(...meetings);
    cursor = nextCursor ?? undefined;
  } while (cursor);
  return all;
}

function toParticipant(token: string): NormalizedParticipant {
  const isEmail = token.includes("@");
  return {
    name: isEmail ? null : token,
    email: isEmail ? token : null,
  };
}

function normalize(
  m: ParsedListMeeting,
  transcript: NormalizedMeeting["transcript"],
): NormalizedMeeting {
  const date = m.date ? new Date(`${m.date}T00:00:00Z`) : null;
  return {
    recordingId: m.recordingId,
    title: m.title,
    meetingTitle: null,
    meetingType: null,
    url: m.url,
    meetingUrl: null,
    shareUrl: null,
    transcriptLanguage: null,
    sharedWith: null,
    calendarInviteesDomainsType: null,
    fathomCreatedAt: date,
    scheduledStartTime: null,
    scheduledEndTime: null,
    recordingStartTime: date,
    recordingEndTime: null,
    recordedByName: m.recorderName,
    recordedByEmail: null,
    recordedByDomain: null,
    recordedByTeam: null,
    summaryTemplateName: null,
    summaryMarkdown: m.summaryMarkdown,
    participants: m.invitees.map(toParticipant),
    transcript,
    actionItems: m.actionItems.map((a) => ({
      description: a.description,
      userGenerated: false,
      completed: a.completed,
      recordingTimestamp: a.recordingTimestamp,
      recordingPlaybackUrl: a.recordingPlaybackUrl,
      assigneeName: a.assigneeName,
      assigneeEmail: null,
      assigneeTeam: null,
    })),
  };
}

/** Pull matched, normalized meetings from the Fathom MCP for the window. */
export async function fetchRecentMeetings(
  createdAfterIso: string,
  createdBeforeIso?: string,
): Promise<{ fetched: number; meetings: NormalizedMeeting[] }> {
  const window: Record<string, unknown> = { created_after: createdAfterIso };
  if (createdBeforeIso) window.created_before = createdBeforeIso;

  const session = await connectForSync();
  try {
      // All accessible meetings in the window, with summary + action items.
      const all = await listAll(session.client, {
        ...window,
        include_summary: true,
        include_action_items: true,
      });

      // Email-precise recorder match via the server-side recorded_by filter.
      const recorded = await listAll(session.client, {
        ...window,
        recorded_by: [...TARGET_EMAILS],
      });
      const recordedIds = new Set(recorded.map((m) => m.recordingId));

      const matched = all.filter(
        (m) =>
          recordedIds.has(m.recordingId) ||
          isTargetToken(m.recorderName) ||
          m.invitees.some(isTargetToken),
      );

      const meetings: NormalizedMeeting[] = [];
      for (const m of matched) {
        const res = await callTool(session.client, "get_meeting_transcript", {
          recording_id: m.recordingId,
        });
        const transcript = parseTranscript(textOf(res)).map((s) => ({
          speakerDisplayName: s.speakerDisplayName,
          matchedInviteeEmail: null,
          text: s.text,
          timestamp: s.timestamp,
        }));
        meetings.push(normalize(m, transcript));
      }

    return { fetched: all.length, meetings };
  } finally {
    await session.close();
  }
}
