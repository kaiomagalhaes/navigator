import "server-only";
import { db } from "@/db";
import { importCalendarRange } from "@/lib/import-events";
import { syncDay } from "@/lib/day-sync";
import { dayWindow, parseDayParam, toDateParam } from "@/lib/format";
import {
  startWorkerRun,
  finishWorkerRun,
  failWorkerRun,
  updateWorkerRunProgress,
  type RunMode,
  type WorkerRunProgress,
} from "@/lib/worker-runs";

// Threads live progress through the per-day loops: mutate `progress`, then
// `flush()` to persist it for the polling Activity page.
type Tracker = { progress: WorkerRunProgress; flush: () => Promise<void> };

// The sync job that keeps the data warm:
//   1. Import the last 30 days of meetings and Fathom-link them — one day at a
//      time with a 20s pause between days to stay under Fathom's 60 req/min.
//   2. Pull the next 7 days of calendar meetings (no Fathom — those recordings
//      don't exist yet).
// Invoked both by the CLI worker (src/worker/daily-sync.ts, run on a Heroku
// Scheduler one-off dyno) and by the "Run sync now" button on the Activity page.

const PAST_DAYS = 30;
const UPCOMING_DAYS = 7;
const FATHOM_PAUSE_MS = 20_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Local midnight for `today + offset` days, reusing the app's local-day helper
// so windows line up with the rest of the app.
function dayAtOffset(offset: number): Date {
  const base = parseDayParam(undefined); // today, local midnight
  const d = new Date(base);
  d.setDate(base.getDate() + offset);
  return d;
}

// Import the previous 30 days (newest first) for every connected account and
// Fathom-link them, pausing 20s between days for Fathom's rate limit.
async function backfillPastMeetings(track?: Tracker): Promise<void> {
  const accounts = await db.query.googleAccounts.findMany();
  if (accounts.length === 0) {
    console.log("[worker:fathom] no connected Google accounts — nothing to do");
    return;
  }
  if (track) {
    track.progress.phase = "backfill";
    await track.flush();
  }
  for (let offset = 1; offset <= PAST_DAYS; offset++) {
    const { dayStart, dayEnd } = dayWindow(dayAtOffset(-offset));
    const dateKey = toDateParam(dayStart);
    console.log(`[worker:fathom] day ${dateKey} (offset -${offset})…`);
    if (track) {
      track.progress.currentDay = dateKey;
      await track.flush();
    }
    for (const account of accounts) {
      try {
        const s = await importCalendarRange(account, dayStart, dayEnd);
        console.log(
          `[worker:fathom]   ${account.email}: imported ${s.imported}, people ${s.people}, linked ${s.linked}`
        );
      } catch (err) {
        console.error(`[worker:fathom]   ${account.email} failed`, err);
      }
    }
    if (track) {
      track.progress.completedDays.push(dateKey);
      await track.flush();
    }
    // No wait after the last day.
    if (offset < PAST_DAYS) await sleep(FATHOM_PAUSE_MS);
  }
}

// Pull today through +7 days from Google (no Fathom), one day at a time.
// Returns how many days actually changed.
async function pullUpcomingMeetings(track?: Tracker): Promise<number> {
  let daysUpdated = 0;
  if (track) {
    track.progress.phase = "upcoming";
    await track.flush();
  }
  for (let offset = 0; offset <= UPCOMING_DAYS; offset++) {
    const { dayStart, dayEnd } = dayWindow(dayAtOffset(offset));
    const dateKey = toDateParam(dayStart);
    if (track) {
      track.progress.currentDay = dateKey;
      await track.flush();
    }
    try {
      const res = await syncDay(dayStart, dayEnd, dateKey);
      if (res.changed) daysUpdated++;
      console.log(`[worker:upcoming] day ${dateKey}: ${res.changed ? "updated" : "no change"}`);
    } catch (err) {
      console.error(`[worker:upcoming] day ${dateKey} failed`, err);
    }
    if (track) {
      track.progress.completedDays.push(dateKey);
      await track.flush();
    }
  }
  return daysUpdated;
}

// Run the sync for an already-opened run record, settling its status. `fathom`
// → past only, `upcoming` → upcoming only, otherwise both (past first).
export async function runSync(
  mode: RunMode,
  run: { id: string; startedAt: Date }
): Promise<void> {
  const startedMs = Date.now();
  console.log(`[worker] starting mode="${mode}"`);
  const progress: WorkerRunProgress = { phase: null, currentDay: null, completedDays: [] };
  const track: Tracker = { progress, flush: () => updateWorkerRunProgress(run.id, progress) };
  try {
    if (mode !== "upcoming") await backfillPastMeetings(track);
    const daysUpdated = mode !== "fathom" ? await pullUpcomingMeetings(track) : 0;
    await finishWorkerRun(run.id, run.startedAt, { daysUpdated });
    console.log(`[worker] done in ${Math.round((Date.now() - startedMs) / 1000)}s`);
  } catch (err) {
    await failWorkerRun(run.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// Open a run record and run the sync — the entry point for both the CLI and the
// Activity page's trigger.
export async function runWorker(mode: RunMode): Promise<void> {
  const run = await startWorkerRun(mode);
  await runSync(mode, run);
}
