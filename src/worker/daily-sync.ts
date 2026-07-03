import "dotenv/config";
import { db } from "@/db";
import { importCalendarRange } from "@/lib/import-events";
import { syncDay } from "@/lib/day-sync";
import { dayWindow, parseDayParam, toDateParam } from "@/lib/format";
import { startWorkerRun, finishWorkerRun, failWorkerRun, type RunMode } from "@/lib/worker-runs";

// Once-a-day job that keeps the data warm without anyone opening the app:
//   1. Import the last 30 days of meetings and Fathom-link them — one day at a
//      time with a 20s pause between days to stay under Fathom's 60 req/min.
//   2. Pull the next 7 days of calendar meetings (no Fathom — those recordings
//      don't exist yet).
// Runs as a Heroku Scheduler one-off dyno (see heroku.yml / docs). Also runnable
// locally via `npm run worker` (and the :fathom / :upcoming variants).

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
async function backfillPastMeetings(): Promise<void> {
  const accounts = await db.query.googleAccounts.findMany();
  if (accounts.length === 0) {
    console.log("[worker:fathom] no connected Google accounts — nothing to do");
    return;
  }
  for (let offset = 1; offset <= PAST_DAYS; offset++) {
    const { dayStart, dayEnd } = dayWindow(dayAtOffset(-offset));
    const dateKey = toDateParam(dayStart);
    console.log(`[worker:fathom] day ${dateKey} (offset -${offset})…`);
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
    // No wait after the last day.
    if (offset < PAST_DAYS) await sleep(FATHOM_PAUSE_MS);
  }
}

// Pull today through +7 days from Google (no Fathom), one day at a time.
// Returns how many days actually changed.
async function pullUpcomingMeetings(): Promise<number> {
  let daysUpdated = 0;
  for (let offset = 0; offset <= UPCOMING_DAYS; offset++) {
    const { dayStart, dayEnd } = dayWindow(dayAtOffset(offset));
    const dateKey = toDateParam(dayStart);
    try {
      const res = await syncDay(dayStart, dayEnd, dateKey);
      if (res.changed) daysUpdated++;
      console.log(`[worker:upcoming] day ${dateKey}: ${res.changed ? "updated" : "no change"}`);
    } catch (err) {
      console.error(`[worker:upcoming] day ${dateKey} failed`, err);
    }
  }
  return daysUpdated;
}

// `fathom` → past only, `upcoming` → upcoming only, otherwise both (past first).
async function main(): Promise<void> {
  const arg = process.argv[2];
  const mode: RunMode = arg === "fathom" || arg === "upcoming" ? arg : "all";
  const startedAt = Date.now();
  console.log(`[worker] starting mode="${mode}"`);

  // Record the run so the Activity page reflects that we ran and what changed.
  const run = await startWorkerRun(mode);
  try {
    if (mode !== "upcoming") await backfillPastMeetings();
    const daysUpdated = mode !== "fathom" ? await pullUpcomingMeetings() : 0;
    await finishWorkerRun(run.id, run.startedAt, { daysUpdated });
  } catch (err) {
    await failWorkerRun(run.id, err instanceof Error ? err.message : String(err));
    throw err;
  }

  console.log(`[worker] done in ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

// End with an explicit exit so the one-off dyno terminates instead of hanging
// on the open pg pool.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[worker] fatal", err);
    process.exit(1);
  });
