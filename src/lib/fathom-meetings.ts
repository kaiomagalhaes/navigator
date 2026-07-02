import "server-only";
import { fathomFetch } from "./fathom";

// ---- Normalized types (decoupled from the raw API shape) -------------------

export type FathomMeeting = {
  recordingId: string; // recording_id is numeric in the API; kept as string
  title: string | null;
  url: string | null;
  shareUrl: string | null;
  scheduledStartTime: Date | null;
  summary: string | null;
  inviteeEmails: string[];
};

export type FathomTranscriptEntry = {
  speaker: string;
  email: string | null;
  text: string;
  timestamp: string;
};

// ---- Raw API shapes (only the fields we read) ------------------------------

type RawInvitee = { email?: string | null };
type RawSummary = { markdown_formatted?: string | null } | null;
type RawMeeting = {
  recording_id: number | string;
  title?: string | null;
  meeting_title?: string | null;
  url?: string | null;
  share_url?: string | null;
  scheduled_start_time?: string | null;
  default_summary?: RawSummary;
  calendar_invitees?: RawInvitee[] | null;
};
type MeetingsResponse = { items: RawMeeting[]; next_cursor?: string | null };
type RawTranscriptEntry = {
  speaker?: { display_name?: string | null; matched_calendar_invitee_email?: string | null } | null;
  text?: string | null;
  timestamp?: string | null;
};
type TranscriptResponse = { transcript?: RawTranscriptEntry[] | null };

function normalizeMeeting(m: RawMeeting): FathomMeeting {
  return {
    recordingId: String(m.recording_id),
    title: m.meeting_title ?? m.title ?? null,
    url: m.url ?? null,
    shareUrl: m.share_url ?? null,
    scheduledStartTime: m.scheduled_start_time ? new Date(m.scheduled_start_time) : null,
    summary: m.default_summary?.markdown_formatted ?? null,
    inviteeEmails: (m.calendar_invitees ?? [])
      .map((i) => i.email?.toLowerCase().trim())
      .filter((e): e is string => Boolean(e)),
  };
}

// ---- API calls -------------------------------------------------------------

// A recording's created_at trails its scheduled start (recording is saved once
// the meeting ends and finishes processing). We scan from shortly before the
// event start to a few hours after so a typical meeting's recording falls in
// the window. The API can't filter by scheduled time, only created_at.
const CREATED_BEFORE_START_MS = 60 * 60 * 1000; // 1h before
const CREATED_AFTER_START_MS = 6 * 60 * 60 * 1000; // 6h after

// Find the Fathom recording for a single event with ONE search call: fetch the
// recordings created around the event and return the best confident match (or
// null). Transcripts are fetched separately, only for the winning match.
export async function findMeetingForEvent(event: MatchableEvent): Promise<FathomMeeting | null> {
  const params = new URLSearchParams({
    created_after: new Date(event.startsAt.getTime() - CREATED_BEFORE_START_MS).toISOString(),
    created_before: new Date(event.startsAt.getTime() + CREATED_AFTER_START_MS).toISOString(),
  });

  const data = await fathomFetch<MeetingsResponse>(`/meetings?${params.toString()}`);
  const meetings = (data.items ?? []).map(normalizeMeeting);
  return pickBestMatch(event, meetings);
}

export async function fetchTranscript(recordingId: string): Promise<FathomTranscriptEntry[]> {
  const data = await fathomFetch<TranscriptResponse>(`/recordings/${recordingId}/transcript`);
  return (data.transcript ?? []).map((e) => ({
    speaker: e.speaker?.display_name?.trim() || "Unknown",
    email: e.speaker?.matched_calendar_invitee_email?.toLowerCase() ?? null,
    text: e.text ?? "",
    timestamp: e.timestamp ?? "",
  }));
}

// ---- Matching (pure) -------------------------------------------------------

// What the scorer needs from a calendar event.
export type MatchableEvent = {
  name: string;
  startsAt: Date;
  emails: string[]; // participant emails + organizer, lowercased
};

// Recording start time must be within this many minutes of the event start to
// even be considered a candidate.
const TIME_WINDOW_MINUTES = 30;
// Minimum combined score for a match to be trusted (title + attendee evidence).
const CONFIDENCE_THRESHOLD = 0.3;

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

function emailOverlap(a: string[], b: string[]): number {
  const sa = new Set(a.map((e) => e.toLowerCase()));
  const sb = new Set(b.map((e) => e.toLowerCase()));
  if (sa.size === 0 || sb.size === 0) return 0;
  const inter = [...sa].filter((e) => sb.has(e)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

export type ScoredMatch = { meeting: FathomMeeting; score: number };

// Score a single meeting against the event. Returns null when the meeting is
// outside the time window (disqualified). Otherwise combines title similarity
// and attendee-email overlap.
export function scoreMatch(event: MatchableEvent, meeting: FathomMeeting): ScoredMatch | null {
  if (!meeting.scheduledStartTime) return null;
  const diffMinutes = Math.abs(meeting.scheduledStartTime.getTime() - event.startsAt.getTime()) / 60_000;
  if (diffMinutes > TIME_WINDOW_MINUTES) return null;

  const title = titleSimilarity(event.name, meeting.title ?? "");
  const attendees = emailOverlap(event.emails, meeting.inviteeEmails);
  // Closer in time breaks ties slightly; title + attendees carry the weight.
  const timeBonus = (1 - diffMinutes / TIME_WINDOW_MINUTES) * 0.1;
  const score = 0.45 * title + 0.45 * attendees + timeBonus;

  return { meeting, score };
}

// Pick the highest-scoring meeting that clears the confidence threshold, or
// null when nothing is a trustworthy match.
export function pickBestMatch(event: MatchableEvent, meetings: FathomMeeting[]): FathomMeeting | null {
  let best: ScoredMatch | null = null;
  for (const meeting of meetings) {
    const scored = scoreMatch(event, meeting);
    if (scored && (!best || scored.score > best.score)) best = scored;
  }
  return best && best.score >= CONFIDENCE_THRESHOLD ? best.meeting : null;
}
