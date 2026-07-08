"use client";

import { useRef, useState, useTransition } from "react";
import { quickAddTodo } from "@/app/actions";

// "+ Add to-do" for the home page's Today's to-dos section: opens a native
// <dialog> with a description field and a Today/Tomorrow choice, then creates
// the task in the Todoist work project. Success closes the dialog (the action
// revalidates "/" so a today task appears in the list) and briefly flips the
// trigger to "✓ Added" — the only visible signal for a tomorrow task, which
// correctly doesn't join today's list. Failure keeps the dialog open with the
// text preserved so the user can retry.
export function QuickAddTodo() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [due, setDue] = useState<"today" | "tomorrow">("today");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  function open() {
    // Fresh slate on every open — a draft abandoned by closing isn't kept.
    setText("");
    setDue("today");
    setError(null);
    dialogRef.current?.showModal();
    textareaRef.current?.focus();
  }

  function submit() {
    if (pending) return; // guards Cmd+Enter re-submission while in flight
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Enter a description.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await quickAddTodo(trimmed, due);
      if (res.error) {
        setError(res.error);
        textareaRef.current?.focus();
        return;
      }
      dialogRef.current?.close();
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    });
  }

  const segment = (value: "today" | "tomorrow", label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={due === value}
      disabled={pending}
      onClick={() => setDue(value)}
      className={
        due === value
          ? "rounded-md bg-white px-3 py-1 text-xs font-medium text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
          : "rounded-md px-3 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      }
    >
      {label}
    </button>
  );

  return (
    <>
      {added ? (
        <span className="flex h-9 items-center px-3 text-sm font-medium text-green-600 dark:text-green-500">
          ✓ Added
        </span>
      ) : (
        <button
          type="button"
          onClick={open}
          className="flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-white"
        >
          + Add to-do
        </button>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="add-todo-title"
        // Native Escape fires "cancel" — block it mid-submit so the dialog
        // can't close while the create is in flight.
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
        // Clicks on the backdrop target the dialog element itself; clicks
        // inside the panel target its children.
        onClick={(e) => {
          if (e.target === dialogRef.current && !pending) dialogRef.current?.close();
        }}
        className="m-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl backdrop:bg-zinc-950/40 backdrop:backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:backdrop:bg-zinc-950/60"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="add-todo-title" className="text-lg font-semibold">
              Add a to-do <span aria-hidden>✍️</span>
            </h2>
            <button
              type="button"
              aria-label="Close"
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
              className="text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
              }}
              rows={3}
              maxLength={500}
              disabled={pending}
              placeholder="What needs doing?"
              aria-label="To-do description"
              className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-zinc-700"
            />
            {text.length >= 450 && (
              <span
                className={`self-end text-xs ${text.length >= 500 ? "text-rose-500" : "text-zinc-400"}`}
              >
                {text.length}/500
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Due
            </span>
            <div
              role="radiogroup"
              aria-label="Due date"
              className="inline-flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800"
            >
              {segment("today", "Today")}
              {segment("tomorrow", "Tomorrow")}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
            <button
              type="submit"
              disabled={pending || text.trim() === ""}
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {pending ? "Adding…" : "Add to-do"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
