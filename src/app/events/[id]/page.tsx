import Link from "next/link";
import { notFound } from "next/navigation";
import { getAvailablePersonsForEvent, getEvent } from "@/db/queries";
import { addParticipant, removeParticipant } from "@/app/actions";
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

  const available = await getAvailablePersonsForEvent(id);
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
          <p className="text-sm text-zinc-500">No participants yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {participants.map(({ person }) => (
              <li
                key={person.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <Link href={`/people/${person.id}`} className="hover:underline">
                  <span className="font-medium">{person.name}</span>
                  <span className="ml-2 text-sm text-zinc-500">{person.email}</span>
                </Link>
                <form action={removeParticipant}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="personId" value={person.id} />
                  <button
                    type="submit"
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {available.length > 0 ? (
          <form
            action={addParticipant}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700"
          >
            <input type="hidden" name="eventId" value={event.id} />
            <label htmlFor="personId" className="text-sm font-medium">
              Add participant
            </label>
            <select
              id="personId"
              name="personId"
              required
              defaultValue=""
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="" disabled>
                Select a person…
              </option>
              {available.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} ({person.email})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Add
            </button>
          </form>
        ) : (
          <p className="text-sm text-zinc-500">
            {participants.length > 0
              ? "Everyone is already participating."
              : "No people available. "}
            {available.length === 0 && (
              <Link href="/people" className="underline">
                Add people
              </Link>
            )}
          </p>
        )}
      </section>
    </div>
  );
}
