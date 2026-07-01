// Normalized meeting shape the MCP source produces and the sync upserts into
// Postgres. Mirrors the Prisma columns so the upsert is a straight mapping.

export interface NormalizedParticipant {
  name: string | null;
  email: string | null;
}

export interface NormalizedTranscriptSegment {
  speakerDisplayName: string | null;
  matchedInviteeEmail: string | null;
  text: string;
  timestamp: string | null;
}

export interface NormalizedActionItem {
  description: string;
  userGenerated: boolean;
  completed: boolean;
  recordingTimestamp: string | null;
  recordingPlaybackUrl: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  assigneeTeam: string | null;
}

export interface NormalizedMeeting {
  recordingId: number;
  title: string;
  meetingTitle: string | null;
  meetingType: string | null;
  url: string;
  meetingUrl: string | null;
  shareUrl: string | null;
  transcriptLanguage: string | null;
  sharedWith: string | null;
  calendarInviteesDomainsType: string | null;
  fathomCreatedAt: Date | null;
  scheduledStartTime: Date | null;
  scheduledEndTime: Date | null;
  recordingStartTime: Date | null;
  recordingEndTime: Date | null;
  recordedByName: string | null;
  recordedByEmail: string | null;
  recordedByDomain: string | null;
  recordedByTeam: string | null;
  summaryTemplateName: string | null;
  summaryMarkdown: string | null;
  participants: NormalizedParticipant[];
  transcript: NormalizedTranscriptSegment[];
  actionItems: NormalizedActionItem[];
}
