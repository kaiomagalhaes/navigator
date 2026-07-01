import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson } from "@/db/queries";
import { formatRange } from "@/lib/format";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const person = await getPerson(id);

  if (!person) {
    notFound();
  }

  const events = person.participations
    .map((p) => p.event)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/people" className="text-sm text-zinc-500 hover:underline">
          ← People
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{person.name}</h1>
      </div>

      <dl className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <dt className="text-xs uppercase tracking-wide text-zinc-500">Email</dt>
        <dd className="mt-1 font-medium">
          <a href={`mailto:${person.email}`} className="hover:underline">
            {person.email}
          </a>
        </dd>
      </dl>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">
          Events participated ({events.length})
        </h2>

        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Not participating in any events yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/events/${event.id}`}
                  className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  <span className="font-medium">{event.name}</span>
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
