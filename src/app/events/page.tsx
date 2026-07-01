import Link from "next/link";
import { listEvents } from "@/db/queries";
import { formatRange } from "@/lib/format";

export default async function EventsPage() {
  const events = await listEvents();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {events.length} event{events.length === 1 ? "" : "s"}
        </p>
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
                    <span className="font-medium">{event.name}</span>
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
