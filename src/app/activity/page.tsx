import { listWorkerRuns } from "@/db/queries";
import { formatDateTime, formatDate } from "@/lib/format";
import type { WorkerRunDetails } from "@/lib/worker-runs";

// Reads the run log on every request.
export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  all: "Full sync",
  fathom: "Past + Fathom",
  upcoming: "Upcoming days",
};

const STATUS_STYLE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  running: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  error: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
};

function duration(startedAt: Date, finishedAt: Date | null): string | null {
  if (!finishedAt) return null;
  const secs = Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export default async function ActivityPage() {
  const runs = await listWorkerRuns();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Each time the sync worker runs, what it added and Fathom-linked.
        </p>
      </div>

      {runs.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No worker runs recorded yet. The daily sync will show up here once it runs.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {runs.map((run) => {
            const details = (run.details as WorkerRunDetails | null) ?? {
              addedEvents: [],
              fathomEvents: [],
            };
            const dur = duration(run.startedAt, run.finishedAt);
            return (
              <li
                key={run.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLE[run.status] ?? STATUS_STYLE.running
                    }`}
                  >
                    {run.status}
                  </span>
                  <span className="font-medium">{MODE_LABEL[run.mode] ?? run.mode}</span>
                  <span className="text-sm text-zinc-500">{formatDateTime(run.startedAt)}</span>
                  {dur && <span className="text-xs text-zinc-400">· {dur}</span>}
                </div>

                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {run.eventsAdded} event{run.eventsAdded === 1 ? "" : "s"} added ·{" "}
                  {run.fathomLinked} Fathom-linked · {run.daysUpdated} day
                  {run.daysUpdated === 1 ? "" : "s"} updated
                </p>

                {run.status === "error" && run.error && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {run.error}
                  </p>
                )}

                {details.addedEvents.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Events added ({details.addedEvents.length})
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {details.addedEvents.map((e, i) => (
                        <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate text-zinc-700 dark:text-zinc-300">
                            {e.name}
                            {e.calendar && (
                              <span className="ml-2 text-xs text-zinc-400">{e.calendar}</span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs text-zinc-500">
                            {formatDate(e.startsAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {details.fathomEvents.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Fathom added ({details.fathomEvents.length})
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {details.fathomEvents.map((e, i) => (
                        <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate text-zinc-700 dark:text-zinc-300">
                            <span className="mr-2 text-green-600 dark:text-green-400" aria-hidden>
                              ●
                            </span>
                            {e.name}
                          </span>
                          {e.startsAt && (
                            <span className="shrink-0 text-xs text-zinc-500">
                              {formatDate(e.startsAt)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
