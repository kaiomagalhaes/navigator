import "server-only";
import { eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, fathomRecordings, workerRuns } from "@/db/schema";

export type RunMode = "all" | "fathom" | "upcoming";

// The specific work a run did, persisted on worker_runs.details for the
// Activity page's expandable result list.
export type WorkerRunDetails = {
  addedEvents: { name: string; startsAt: string; calendar: string | null }[];
  fathomEvents: { name: string; startsAt: string | null }[];
};

// Live progress while a run is in flight, polled by the Activity page.
export type WorkerRunProgress = {
  phase: "backfill" | "upcoming" | null;
  currentDay: string | null; // the day (YYYY-MM-DD) processing right now
  completedDays: string[]; // days finished so far, in order
};

// Best-effort progress update (a failed write must never fail the sync).
export async function updateWorkerRunProgress(
  id: string,
  progress: WorkerRunProgress
): Promise<void> {
  try {
    await db.update(workerRuns).set({ progress }).where(eq(workerRuns.id, id));
  } catch (err) {
    console.error("[worker] progress update failed", err);
  }
}

// Open a run record before any work starts. Its startedAt is the cut-off we use
// afterward to attribute newly-created rows to this run.
export async function startWorkerRun(mode: RunMode): Promise<{ id: string; startedAt: Date }> {
  const [row] = await db
    .insert(workerRuns)
    .values({ mode, status: "running" })
    .returning({ id: workerRuns.id, startedAt: workerRuns.startedAt });
  return row;
}

// Close out a successful run: gather everything created since it began (events
// and first-time Fathom links) and store the counts + detail lists.
export async function finishWorkerRun(
  id: string,
  startedAt: Date,
  extra: { daysUpdated: number }
): Promise<void> {
  const added = await db.query.calendarEvents.findMany({
    where: gte(calendarEvents.createdAt, startedAt),
    with: { account: { columns: { email: true } } },
    orderBy: (e, { asc }) => [asc(e.startsAt)],
  });
  const linked = await db.query.fathomRecordings.findMany({
    where: gte(fathomRecordings.createdAt, startedAt),
    with: { event: { columns: { name: true, startsAt: true } } },
    orderBy: (r, { asc }) => [asc(r.createdAt)],
  });

  const details: WorkerRunDetails = {
    addedEvents: added.map((e) => ({
      name: e.name,
      startsAt: e.startsAt.toISOString(),
      calendar: e.account?.email ?? null,
    })),
    fathomEvents: linked.map((r) => ({
      name: r.event?.name ?? r.title ?? "(unknown meeting)",
      startsAt: r.event?.startsAt?.toISOString() ?? null,
    })),
  };

  await db
    .update(workerRuns)
    .set({
      status: "success",
      finishedAt: new Date(),
      eventsAdded: added.length,
      fathomLinked: linked.length,
      daysUpdated: extra.daysUpdated,
      details,
      progress: null,
    })
    .where(eq(workerRuns.id, id));
}

// Mark a run failed, keeping whatever it managed to do before the error.
export async function failWorkerRun(id: string, error: string): Promise<void> {
  await db
    .update(workerRuns)
    .set({ status: "error", finishedAt: new Date(), error, progress: null })
    .where(eq(workerRuns.id, id));
}
