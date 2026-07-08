"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { quickAddTodo } from "@/app/actions";
import type { MentionPerson } from "@/db/queries";

// "+ Add to-do" for the home page's top control row: opens a native <dialog>
// with a description field and a Today/Tomorrow choice, then creates the task
// in the Todoist work project. Success closes the dialog (the action
// revalidates "/" so a today task appears in the list) and briefly flips the
// trigger to "✓ Added" — the only visible signal for a tomorrow task, which
// correctly doesn't join today's list. Failure keeps the dialog open with the
// text preserved so the user can retry.
//
// Typing "@" (at the start of the text or after whitespace) opens a dropdown
// of the app's people; selecting one splices "@Full Name " into the text. The
// mention is plain text in the created Todoist task — a spelling aid, not an
// assignment.
export function QuickAddTodo({ people }: { people: MentionPerson[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [due, setDue] = useState<"today" | "tomorrow">("today");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  // The active "@fragment" being typed: `start` is the index of the "@",
  // `query` the text between it and the caret. Re-derived on every edit and
  // caret move; null when the caret isn't inside a candidate mention. The
  // dropdown is open iff a fragment exists AND at least one person matches —
  // a completed mention ("@Kaio Magalhaes ") stops matching on its own, so no
  // "committed mentions" bookkeeping is needed.
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return people.filter(
      (p) => p.label.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
    );
  }, [mention, people]);
  const dropdownOpen = mention !== null && matches.length > 0;
  // A shrinking result list must not strand the highlight out of range.
  const active = Math.min(highlight, matches.length - 1);

  // Find the candidate mention around the caret: the last "@" at the start of
  // the text or after whitespace, with no other "@" and no newline before the
  // caret. Spaces are allowed in the query (names contain them); zero matches
  // simply hides the dropdown.
  function updateMention(value: string, caret: number) {
    const m = /(?:^|\s)@([^@\n]*)$/.exec(value.slice(0, caret));
    if (!m) {
      setMention(null);
      return;
    }
    const query = m[1];
    const start = caret - query.length - 1;
    if (!mention || mention.query !== query || mention.start !== start) setHighlight(0);
    setMention({ start, query });
  }

  function insertMention(person: MentionPerson) {
    const el = textareaRef.current;
    if (!el || !mention) return;
    const inserted = `@${person.label} `;
    // maxLength doesn't constrain programmatic values, so clamp here; the
    // counter turning rose at 500 signals a truncated tail.
    const next = (text.slice(0, mention.start) + inserted + text.slice(el.selectionStart)).slice(
      0,
      500
    );
    const caret = Math.min(mention.start + inserted.length, 500);
    // Commit synchronously so the caret lands on the updated DOM value —
    // React would otherwise snap it to the end on the programmatic change.
    flushSync(() => {
      setText(next);
      setMention(null);
    });
    el.focus();
    el.setSelectionRange(caret, caret);
  }

  function moveHighlight(delta: number) {
    const next = (active + delta + matches.length) % matches.length;
    setHighlight(next);
    requestAnimationFrame(() => {
      document.getElementById(`mention-option-${next}`)?.scrollIntoView({ block: "nearest" });
    });
  }

  function open() {
    // Fresh slate on every open — a draft abandoned by closing isn't kept.
    setText("");
    setDue("today");
    setError(null);
    setMention(null);
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

  function onTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter always submits, even mid-mention.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      submit();
      return;
    }
    if (!dropdownOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(matches[active]);
    } else if (e.key === "Escape") {
      // preventDefault stops the keydown's default action — the <dialog>'s
      // Escape-cancel — so only the dropdown closes here.
      e.preventDefault();
      setMention(null);
    }
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

          <div className="relative flex flex-col gap-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                updateMention(e.target.value, e.target.selectionStart);
              }}
              // Caret moves (click, arrows) can enter or leave a fragment.
              onSelect={(e) => updateMention(e.currentTarget.value, e.currentTarget.selectionStart)}
              onBlur={() => setMention(null)}
              onKeyDown={onTextareaKeyDown}
              rows={3}
              maxLength={500}
              disabled={pending}
              placeholder="What needs doing? Type @ to mention someone"
              aria-label="To-do description"
              aria-controls="mention-listbox"
              aria-autocomplete="list"
              aria-activedescendant={dropdownOpen ? `mention-option-${active}` : undefined}
              className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-zinc-700"
            />
            {dropdownOpen && (
              <div
                id="mention-listbox"
                role="listbox"
                aria-label="People"
                className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
              >
                {matches.map((p, i) => (
                  <div
                    key={p.id}
                    id={`mention-option-${i}`}
                    role="option"
                    aria-selected={i === active}
                    // mousedown (not click) so the textarea never blurs; hover
                    // moves the highlight via real pointer motion only.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(p);
                    }}
                    onMouseMove={() => setHighlight(i)}
                    className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm ${
                      i === active ? "bg-zinc-100 dark:bg-zinc-800" : ""
                    }`}
                  >
                    <span className="shrink-0 font-medium text-zinc-900 dark:text-zinc-100">
                      {p.label}
                    </span>
                    <span className="min-w-0 truncate text-xs text-zinc-400 dark:text-zinc-500">
                      {p.email}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
