"use client";

import { useState, useTransition } from "react";
import { copyMeetingTodoToTodoist } from "@/app/actions";
import { MarkdownText } from "./markdown-text";

// A single meeting action item on the event page. When it hasn't been copied to
// Todoist yet it shows a "→ Todoist" button that reveals a Today / Tomorrow
// choice; picking one creates the task in Todoist and crosses the item off.
// Once copied it renders struck-through with a small "In Todoist" tag.
export function MeetingTodo({
  todoId,
  text,
  tsIndex,
  assigneeName,
  copied: initialCopied,
}: {
  todoId: string;
  text: string;
  tsIndex: number | null;
  assigneeName?: string | null;
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

  const label =
    tsIndex !== null ? (
      <a
        href={`#ts-${tsIndex}`}
        title="Jump to this moment in the transcript"
        className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
      >
        <MarkdownText>{text}</MarkdownText>
      </a>
    ) : (
      <MarkdownText>{text}</MarkdownText>
    );

  return (
    <li className="flex items-start gap-2 text-sm">
      <span className={`mt-px ${copied ? "text-green-600 dark:text-green-500" : "text-zinc-400"}`} aria-hidden>
        {copied ? "☑" : "☐"}
      </span>
      <div className="min-w-0 flex-1">
        <span className={copied ? "text-zinc-400 line-through" : ""}>
          {label}
          {assigneeName && <span className="text-zinc-500"> — {assigneeName}</span>}
        </span>

        {!copied && !choosing && (
          <button
            type="button"
            onClick={() => setChoosing(true)}
            disabled={pending}
            className="ml-2 rounded-md border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            → Todoist
          </button>
        )}

        {choosing && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs">
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
        )}

        {copied && !error && (
          <span className="ml-2 text-xs text-green-600 dark:text-green-500">In Todoist</span>
        )}
        {error && <span className="ml-2 text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </li>
  );
}
