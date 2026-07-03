"use client";

import { useState, useTransition } from "react";
import { completeTodoistTask } from "@/app/actions";
import type { TodoistTask } from "@/lib/todoist";
import { MarkdownText } from "./markdown-text";

// Todoist priority is 4 (urgent, "p1") … 1 (none). Color the checkbox by
// priority so urgent items read at a glance.
function priorityBorder(priority: number): string {
  if (priority >= 4) return "border-rose-500";
  if (priority === 3) return "border-amber-500";
  if (priority === 2) return "border-sky-500";
  return "border-zinc-400";
}

// The filled look once checked: solid in the same priority color.
function priorityFill(priority: number): string {
  if (priority >= 4) return "bg-rose-500 border-rose-500";
  if (priority === 3) return "bg-amber-500 border-amber-500";
  if (priority === 2) return "bg-sky-500 border-sky-500";
  return "bg-zinc-400 border-zinc-400";
}


// A single Todoist task row. Clicking the checkbox completes it in Todoist via
// a server action; the row is optimistically checked + faded, then the page
// revalidates and the completed task drops out of the "today | overdue" list.
export function TodoistTaskItem({ task, today }: { task: TodoistTask; today: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isOverdue = Boolean(task.dueDate && task.dueDate < today);

  function complete() {
    if (done || pending) return;
    setError(null);
    setDone(true); // optimistic
    startTransition(async () => {
      const res = await completeTodoistTask(task.id);
      if (res?.error) {
        setDone(false); // revert on failure
        setError(res.error);
      }
      // On success, revalidatePath re-renders the page and this row disappears.
    });
  }

  return (
    <li
      className={`flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition-opacity dark:border-zinc-800 dark:bg-zinc-950 ${
        done ? "opacity-50" : ""
      }`}
    >
      <button
        type="button"
        onClick={complete}
        disabled={done || pending}
        aria-label={`Mark "${task.content}" done in Todoist`}
        title="Mark done in Todoist"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold leading-none text-white transition-all hover:border-green-500 hover:bg-green-500 disabled:cursor-default ${
          done ? priorityFill(task.priority) : priorityBorder(task.priority)
        }`}
      >
        {done ? "✓" : ""}
      </button>
      <div className={`min-w-0 flex-1 text-sm ${done ? "line-through" : ""}`}>
        <MarkdownText>{task.content}</MarkdownText>
        {isOverdue && (
          <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            Overdue · {task.due}
          </span>
        )}
        {task.isRecurring && task.due && !isOverdue && (
          <span className="ml-2 text-xs text-zinc-500">↻ {task.due}</span>
        )}
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <a
        href={task.url}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in Todoist"
        aria-label="Open in Todoist"
        className="mt-0.5 shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        ↗
      </a>
    </li>
  );
}
