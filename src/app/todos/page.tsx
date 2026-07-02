import Link from "next/link";
import { listTodosForEmails } from "@/db/queries";
import { formatDate } from "@/lib/format";
import { listTasksDueTodayOrOverdue, type TodoistTask } from "@/lib/todoist";

// The emails that count as "me". To-dos assigned to a person with one of these
// addresses show up on this page, wherever meeting they came from.
const MY_EMAILS = ["kaio@codelitt.com", "kaio@carboncrei.com"];

// This page reads live from Todoist on every request, so never cache it.
export const dynamic = "force-dynamic";

type TodoistResult =
  | { status: "ok"; tasks: TodoistTask[] }
  | { status: "not-configured" }
  | { status: "error" };

async function getTodoistToday(): Promise<TodoistResult> {
  if (!process.env.TODOIST_API_TOKEN) return { status: "not-configured" };
  try {
    return { status: "ok", tasks: await listTasksDueTodayOrOverdue() };
  } catch (err) {
    console.error("[todos] failed to load Todoist tasks", err);
    return { status: "error" };
  }
}

export default async function TodosPage() {
  const [todos, todoist] = await Promise.all([
    listTodosForEmails(MY_EMAILS),
    getTodoistToday(),
  ]);

  // Group meeting to-dos by the meeting they came from, newest meeting first,
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
    <div className="flex flex-col gap-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">To Dos</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          What&apos;s due today or overdue, plus action items assigned to you across your meetings
        </p>
      </div>

      <TodoistSection result={todoist} />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">From your meetings</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No meeting action items assigned to you yet. Open an{" "}
            <Link href="/events" className="underline">
              event
            </Link>{" "}
            and extract its to-dos to see them here.
          </p>
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

// Todoist priority is 4 (urgent, "p1") … 1 (none). Give the top two a colored
// flag so urgent items read at a glance; lower ones get a plain checkbox.
function priorityFlag(priority: number): string {
  if (priority >= 4) return "text-rose-500";
  if (priority === 3) return "text-amber-500";
  if (priority === 2) return "text-sky-500";
  return "text-zinc-400";
}

function TodoistSection({ result }: { result: TodoistResult }) {
  // Local calendar date as "YYYY-MM-DD", to tell overdue tasks from today's.
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-medium">Today &amp; overdue</h2>
        {result.status === "ok" && (
          <span className="text-sm text-zinc-500">
            {result.tasks.length} from Todoist
          </span>
        )}
      </div>

      {result.status === "not-configured" && (
        <p className="text-sm text-zinc-500">
          Todoist isn&apos;t connected. Set <code>TODOIST_API_TOKEN</code> to see
          tasks due today.
        </p>
      )}

      {result.status === "error" && (
        <p className="text-sm text-zinc-500">
          Couldn&apos;t reach Todoist. Check your API token and try again.
        </p>
      )}

      {result.status === "ok" &&
        (result.tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-950">
            <span className="text-3xl" aria-hidden>
              🎉
            </span>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Nothing due or overdue in Todoist. All caught up!
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {result.tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span className={`mt-0.5 ${priorityFlag(task.priority)}`} aria-hidden>
                  ☐
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={task.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm hover:underline"
                  >
                    {task.content}
                  </a>
                  {task.dueDate && task.dueDate < today && (
                    <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      Overdue · {task.due}
                    </span>
                  )}
                  {task.isRecurring && task.due && !(task.dueDate && task.dueDate < today) && (
                    <span className="ml-2 text-xs text-zinc-500">↻ {task.due}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
