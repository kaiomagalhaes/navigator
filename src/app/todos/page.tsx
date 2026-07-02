import Link from "next/link";
import { listTodosForEmails } from "@/db/queries";
import { formatDate } from "@/lib/format";
import { listTasksDueTodayOrOverdue, type TodoistTask } from "@/lib/todoist";
import { TodoistTaskItem } from "@/components/todoist-task";
import { MeetingReviewGroup } from "@/components/meeting-review-group";

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
  // Meetings marked reviewed are dropped so they no longer show here.
  const byEvent = new Map<
    string,
    { id: string; name: string; startsAt: Date; items: typeof todos }
  >();
  for (const todo of todos) {
    if (todo.event.todosReviewedAt) continue;
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
              <MeetingReviewGroup
                key={group.id}
                eventId={group.id}
                eventName={group.name}
                date={formatDate(group.startsAt)}
                items={group.items.map((todo) => ({
                  id: todo.id,
                  text: todo.text,
                  copied: Boolean(todo.todoistTaskId),
                }))}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
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
              <TodoistTaskItem key={task.id} task={task} today={today} />
            ))}
          </ul>
        ))}
    </section>
  );
}
