import "dotenv/config";
import { runWorker } from "@/lib/worker";
import type { RunMode } from "@/lib/worker-runs";

// Thin CLI wrapper around runWorker (src/lib/worker.ts), runnable via
// `npm run worker` (and the :fathom / :upcoming variants), and on a Heroku
// Scheduler one-off dyno. `fathom` → past only, `upcoming` → upcoming only.
async function main(): Promise<void> {
  const arg = process.argv[2];
  const mode: RunMode = arg === "fathom" || arg === "upcoming" ? arg : "all";
  await runWorker(mode);
}

// End with an explicit exit so the one-off dyno terminates instead of hanging
// on the open pg pool.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[worker] fatal", err);
    process.exit(1);
  });
