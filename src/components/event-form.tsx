"use client";

import { useActionState } from "react";
import { createEvent, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";

const initialState: FormState = {};

const fieldClass =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

export function EventForm() {
  const [state, formAction] = useActionState(createEvent, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="name" className="text-sm font-medium">
          Event name
        </label>
        <input id="name" name="name" type="text" required className={fieldClass} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="startsAt" className="text-sm font-medium">
            Starts at
          </label>
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="endsAt" className="text-sm font-medium">
            Ends at
          </label>
          <input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            required
            className={fieldClass}
          />
        </div>
      </div>
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      <div>
        <SubmitButton>Create event</SubmitButton>
      </div>
    </form>
  );
}
