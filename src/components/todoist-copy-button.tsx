"use client";

import { useState, useTransition } from "react";
import { copyMeetingTodoToTodoist } from "@/app/actions";

// A compact "→ Todoist" control for a single meeting to-do: reveals a
// Today / Tomorrow choice, then creates the Todoist task and shows "In Todoist".
// Optimistic; the underlying action is idempotent (a to-do already copied is a
// no-op), so re-clicking never duplicates. Shared by the event page's to-do list
// (via MeetingTodo) pattern and the prep results' "for you" items.
export function TodoistCopyButton({
  todoId,
  copied: initialCopied,
}: {
  todoId: string;
  copied: boolean;
}) {
  const [copied, setCopied] = useState(initialCopied);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function copy(due: "today" | "tomorrow") {
    setChoosing(false);
    setError(null);
    setCopied(true); // optimistic
    startTransition(async () => {
      const res = await copyMeetingTodoToTodoist(todoId, due);
      if (res?.error) {
        setCopied(false);
        setError(res.error);
      }
    });
  }

  if (copied) {
    return <span className="text-xs text-green-600 dark:text-green-500">In Todoist</span>;
  }

  if (choosing) {
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <span className="text-zinc-500">Due:</span>
        <button
          type="button"
          onClick={() => copy("today")}
          className="rounded-md bg-zinc-900 px-1.5 py-0.5 font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => copy("tomorrow")}
          className="rounded-md bg-zinc-900 px-1.5 py-0.5 font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Tomorrow
        </button>
        <button
          type="button"
          onClick={() => setChoosing(false)}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setChoosing(true)}
        disabled={pending}
        className="rounded-md border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        → Todoist
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
