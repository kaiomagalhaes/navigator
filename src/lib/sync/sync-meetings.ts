// Core daily sync: pull recent meetings from the Fathom MCP and persist them
// idempotently.
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { fetchRecentMeetings } from "@/lib/sync/sources/mcp";
import type { NormalizedMeeting } from "@/lib/sync/types";

export interface SyncResult {
  fetched: number;
  matched: number;
  upserted: number;
  meetings: { recordingId: number; title: string }[];
}

export interface SyncOptions {
  /** ISO 8601. Defaults to now − SYNC_LOOKBACK_HOURS. */
  createdAfter?: string;
  /** ISO 8601. Defaults to now (open-ended). */
  createdBefore?: string;
}

async function upsertMeeting(meeting: NormalizedMeeting): Promise<void> {
  const {
    recordingId,
    participants,
    transcript,
    actionItems,
    ...base
  } = meeting;

  await prisma.$transaction(async (tx) => {
    const saved = await tx.meeting.upsert({
      where: { recordingId },
      create: { recordingId, ...base },
      update: base,
    });

    await tx.participant.deleteMany({ where: { meetingId: saved.id } });
    await tx.transcriptSegment.deleteMany({ where: { meetingId: saved.id } });
    await tx.actionItem.deleteMany({ where: { meetingId: saved.id } });

    if (participants.length > 0) {
      await tx.participant.createMany({
        data: participants.map((p) => ({ ...p, meetingId: saved.id })),
      });
    }
    if (transcript.length > 0) {
      await tx.transcriptSegment.createMany({
        data: transcript.map((t, idx) => ({ ...t, idx, meetingId: saved.id })),
      });
    }
    if (actionItems.length > 0) {
      await tx.actionItem.createMany({
        data: actionItems.map((a) => ({ ...a, meetingId: saved.id })),
      });
    }
  });
}

/**
 * Run the sync for a window and persist matching meetings idempotently. With no
 * options it behaves as the daily sync: looks back `SYNC_LOOKBACK_HOURS` (default
 * 26h overlap is harmless because writes are idempotent). Pass createdAfter/
 * createdBefore to sync an explicit period (e.g. from the dashboard button).
 */
export async function syncMeetings(opts: SyncOptions = {}): Promise<SyncResult> {
  const lookbackMs = env.syncLookbackHours * 60 * 60 * 1000;
  const createdAfter =
    opts.createdAfter ?? new Date(Date.now() - lookbackMs).toISOString();

  const run = await prisma.syncRun.create({ data: { status: "running" } });

  try {
    const { fetched, meetings } = await fetchRecentMeetings(
      createdAfter,
      opts.createdBefore,
    );

    for (const meeting of meetings) {
      await upsertMeeting(meeting);
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        meetingsFetched: fetched,
        meetingsMatched: meetings.length,
        meetingsUpserted: meetings.length,
      },
    });

    return {
      fetched,
      matched: meetings.length,
      upserted: meetings.length,
      meetings: meetings.map((m) => ({
        recordingId: m.recordingId,
        title: m.title,
      })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), error: message },
    });
    throw err;
  }
}
