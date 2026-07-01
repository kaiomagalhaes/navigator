import Link from "next/link";
import { deleteAllEvents } from "@/app/actions";
import { listEvents } from "@/db/queries";
import { formatRange } from "@/lib/format";

export default async function EventsPage() {
  const events = await listEvents();

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {events.length} event{events.length === 1 ? "" : "s"}
          </p>
        </div>
        {events.length > 0 && (
          <form action={deleteAllEvents}>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              Delete all events
            </button>
          </form>
        )}
      </div>

      <section>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No events yet.{" "}
            <Link href="/calendars" className="underline">
              Import from a connected calendar
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/events/${event.id}`}
                  className="block rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="flex items-center gap-2 font-medium">
                      {event.name}
                      {event.fathomRecording && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                          <span aria-hidden>●</span> Fathom
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {event.participants.length} participant
                      {event.participants.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {formatRange(event.startsAt, event.endsAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
