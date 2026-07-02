"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setMeetingReviewed } from "@/app/actions";
import { MeetingTodo } from "./meeting-todo";

type Item = { id: string; text: string; copied: boolean };

// One meeting's group of to-dos on the To Dos page. The "Mark reviewed" button
// hides the whole section (optimistically), then persists via a server action;
// on failure it reappears with an error.
export function MeetingReviewGroup({
  eventId,
  eventName,
  date,
  items,
}: {
  eventId: string;
  eventName: string;
  date: string;
  items: Item[];
}) {
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function review() {
    setError(null);
    setReviewed(true); // optimistic hide
    startTransition(async () => {
      const res = await setMeetingReviewed(eventId, true);
      if (res?.error) {
        setReviewed(false);
        setError(res.error);
      }
    });
  }

  if (reviewed) return null;

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-baseline justify-between gap-4">
        <Link href={`/events/${eventId}`} className="font-medium hover:underline">
          {eventName}
        </Link>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-zinc-500">{date}</span>
          <button
            type="button"
            onClick={review}
            disabled={pending}
            title="Hide this meeting from the To Dos page"
            className="rounded-md border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Mark reviewed
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <MeetingTodo
            key={item.id}
            todoId={item.id}
            text={item.text}
            tsIndex={null}
            copied={item.copied}
          />
        ))}
      </ul>
    </li>
  );
}
