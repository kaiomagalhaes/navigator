import Link from "next/link";
import { listTodosForEmails } from "@/db/queries";
import { formatDate } from "@/lib/format";

// The emails that count as "me". To-dos assigned to a person with one of these
// addresses show up on this page, wherever meeting they came from.
const MY_EMAILS = ["kaio@codelitt.com", "kaio@carboncrei.com"];

export default async function TodosPage() {
  const todos = await listTodosForEmails(MY_EMAILS);

  // Group by the meeting a to-do came from, keeping newest meetings first and
  // preserving the in-meeting order (the query already sorts by createdAt).
  const byEvent = new Map<
    string,
    { id: string; name: string; startsAt: Date; items: typeof todos }
  >();
  for (const todo of todos) {
    const group = byEvent.get(todo.event.id) ?? {
      id: todo.event.id,
      name: todo.event.name,
      startsAt: todo.event.startsAt,
      items: [] as typeof todos,
    };
    group.items.push(todo);
    byEvent.set(todo.event.id, group);
  }
  const groups = [...byEvent.values()].sort(
    (a, b) => b.startsAt.getTime() - a.startsAt.getTime()
  );

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">To Dos</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {todos.length === 0
            ? "Action items assigned to you across your meetings"
            : `${todos.length} action item${todos.length === 1 ? "" : "s"} across ${groups.length} meeting${groups.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <section>
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-950">
            <span className="text-4xl" aria-hidden>
              ✅
            </span>
            <h2 className="text-lg font-semibold">Nothing assigned to you</h2>
            <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
              To-dos appear here once they&apos;re extracted from a meeting&apos;s
              transcript and assigned to you. Open an{" "}
              <Link href="/events" className="underline">
                event
              </Link>{" "}
              and extract its to-dos to get started.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {groups.map((group) => (
              <li
                key={group.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <Link
                    href={`/events/${group.id}`}
                    className="font-medium hover:underline"
                  >
                    {group.name}
                  </Link>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {formatDate(group.startsAt)}
                  </span>
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {group.items.map((todo) => (
                    <li key={todo.id} className="flex gap-2 text-sm">
                      <span className="text-zinc-400" aria-hidden>
                        ☐
                      </span>
                      <span>{todo.text}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
