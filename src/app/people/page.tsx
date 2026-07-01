import Link from "next/link";
import { listPersons } from "@/db/queries";

export default async function PeoplePage() {
  const people = await listPersons();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {people.length} {people.length === 1 ? "person" : "people"}
        </p>
      </div>

      <section>
        {people.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No people yet. People appear here after you{" "}
            <Link href="/calendars" className="underline">
              import events
            </Link>{" "}
            — they come from meeting attendees.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {people.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/people/${person.id}`}
                  className="block rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">{person.name}</span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {person.participations.length} event
                      {person.participations.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {person.email}
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
