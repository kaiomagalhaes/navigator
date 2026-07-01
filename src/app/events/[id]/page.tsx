import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvent } from "@/db/queries";
import { formatDateTime } from "@/lib/format";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) {
    notFound();
  }

  const participants = [...event.participants].sort((a, b) =>
    a.person.name.localeCompare(b.person.name)
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/events" className="text-sm text-zinc-500 hover:underline">
          ← Events
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{event.name}</h1>
      </div>

      <dl className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Starts</dt>
          <dd className="mt-1 font-medium">{formatDateTime(event.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Ends</dt>
          <dd className="mt-1 font-medium">{formatDateTime(event.endsAt)}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">
          Participants ({participants.length})
        </h2>

        {participants.length === 0 ? (
          <p className="text-sm text-zinc-500">No participants on this event.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {participants.map(({ person }) => (
              <li
                key={person.id}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <Link href={`/people/${person.id}`} className="hover:underline">
                  <span className="font-medium">{person.name}</span>
                  <span className="ml-2 text-sm text-zinc-500">{person.email}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
