// Parsers for the Fathom MCP's text output. The MCP returns human-formatted
// text (no structured JSON), so the sync depends on these formats:
//
//   list_meetings:
//     Found N meeting(s). ... [More results available: call again with next_cursor=XXX]
//     - TITLE | YYYY-MM-DD | id: ID | url: URL | recorded by RECORDER[ | INVITEES_CSV]
//       Summary:
//       <markdown...>
//       Action items:
//         • [ ] DESC — assigned to ASSIGNEE (PLAYBACK_URL)
//
//   get_meeting_transcript:
//     [MM:SS](URL?timestamp=secs) Speaker Name: text

export interface ParsedActionItem {
  description: string;
  completed: boolean;
  assigneeName: string | null;
  recordingPlaybackUrl: string | null;
  recordingTimestamp: string | null;
}

export interface ParsedListMeeting {
  recordingId: number;
  title: string;
  date: string | null;
  url: string;
  recorderName: string | null;
  invitees: string[];
  summaryMarkdown: string | null;
  actionItems: ParsedActionItem[];
}

export interface ParsedTranscriptSegment {
  speakerDisplayName: string;
  text: string;
  timestamp: string | null;
}

const HEADER_RE =
  /^- (.+?) \| (\d{4}-\d{2}-\d{2}) \| id: (\d+) \| url: (\S+) \| recorded by (.+?)(?: \| (.+))?$/;
const ACTION_RE =
  /^•\s*\[([ xX])\]\s*(.+?)\s+—\s+assigned to\s+(.+?)\s+\((https?:\/\/[^)]+)\)\s*$/;
const TRANSCRIPT_RE =
  /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\((https?:\/\/[^)]+)\)\s+([^:]+):\s+([\s\S]*)$/;

function timestampFromUrl(url: string): string | null {
  const m = url.match(/[?&]timestamp=([\d.]+)/);
  if (!m) return null;
  const secs = Math.floor(Number(m[1]));
  if (Number.isNaN(secs)) return null;
  const h = Math.floor(secs / 3600);
  const mnt = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(mnt)}:${pad(s)}` : `${pad(mnt)}:${pad(s)}`;
}

function parseActionItem(line: string): ParsedActionItem | null {
  const m = line.match(ACTION_RE);
  if (m) {
    return {
      completed: m[1].toLowerCase() === "x",
      description: m[2].trim(),
      assigneeName: m[3].trim() || null,
      recordingPlaybackUrl: m[4],
      recordingTimestamp: timestampFromUrl(m[4]),
    };
  }
  // Fallback: bullet without the "assigned to (...)" tail.
  const bullet = line.match(/^•\s*\[([ xX])\]\s*(.+?)\s*$/);
  if (bullet) {
    return {
      completed: bullet[1].toLowerCase() === "x",
      description: bullet[2].trim(),
      assigneeName: null,
      recordingPlaybackUrl: null,
      recordingTimestamp: null,
    };
  }
  return null;
}

/** Extract the pagination cursor from the preamble, or null if last page. */
export function parseNextCursor(text: string): string | null {
  const m = text.match(/next_cursor=([^\s]+)/);
  return m ? m[1] : null;
}

export function parseListPage(text: string): {
  meetings: ParsedListMeeting[];
  nextCursor: string | null;
} {
  const lines = text.split("\n");
  const meetings: ParsedListMeeting[] = [];
  let current: ParsedListMeeting | null = null;
  let section: "summary" | "actions" | null = null;
  let summaryLines: string[] = [];

  const flush = () => {
    if (current) {
      current.summaryMarkdown = summaryLines.join("\n").trim() || null;
      meetings.push(current);
    }
    current = null;
    section = null;
    summaryLines = [];
  };

  for (const raw of lines) {
    const header = raw.match(HEADER_RE);
    if (header) {
      flush();
      current = {
        title: header[1].trim(),
        date: header[2],
        recordingId: Number(header[3]),
        url: header[4],
        recorderName: header[5].trim() || null,
        invitees: header[6]
          ? header[6].split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        summaryMarkdown: null,
        actionItems: [],
      };
      continue;
    }
    if (!current) continue;

    const trimmed = raw.trim();
    if (trimmed === "Summary:") {
      section = "summary";
      continue;
    }
    if (trimmed === "Action items:") {
      section = "actions";
      continue;
    }
    if (section === "summary") {
      summaryLines.push(trimmed);
    } else if (section === "actions" && trimmed.startsWith("•")) {
      const item = parseActionItem(trimmed);
      if (item) current.actionItems.push(item);
    }
  }
  flush();

  return { meetings, nextCursor: parseNextCursor(text) };
}

export function parseTranscript(text: string): ParsedTranscriptSegment[] {
  const segments: ParsedTranscriptSegment[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line) continue;
    const m = line.match(TRANSCRIPT_RE);
    if (m) {
      segments.push({
        timestamp: m[1],
        speakerDisplayName: m[3].trim(),
        text: m[4].trim(),
      });
    } else if (segments.length > 0) {
      // Continuation of the previous speaker's text.
      segments[segments.length - 1].text += "\n" + line.trim();
    }
  }
  return segments;
}
