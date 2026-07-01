"use client";

import { useActionState } from "react";
import { createPerson, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";

const initialState: FormState = {};

const fieldClass =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

export function PersonForm() {
  const [state, formAction] = useActionState(createPerson, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input id="name" name="name" type="text" required className={fieldClass} />
      </div>
      <div>
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input id="email" name="email" type="email" required className={fieldClass} />
      </div>
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      <div>
        <SubmitButton>Add person</SubmitButton>
      </div>
    </form>
  );
}
