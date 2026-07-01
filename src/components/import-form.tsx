"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importEvents, type ImportState } from "@/app/actions";
import { SubmitButton } from "./submit-button";

const initialState: ImportState = {};

const fieldClass =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

type Account = { id: string; email: string };

export function ImportForm({
  accounts,
  defaultFrom,
  defaultTo,
}: {
  accounts: Account[];
  defaultFrom: string;
  defaultTo: string;
}) {
  const [state, formAction] = useActionState(importEvents, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="accountId" className="text-sm font-medium">
          Calendar
        </label>
        <select id="accountId" name="accountId" required className={fieldClass} defaultValue="">
          <option value="" disabled>
            Select a connected calendar…
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.email}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="from" className="text-sm font-medium">
            From
          </label>
          <input id="from" name="from" type="date" required defaultValue={defaultFrom} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="to" className="text-sm font-medium">
            To
          </label>
          <input id="to" name="to" type="date" required defaultValue={defaultTo} className={fieldClass} />
        </div>
      </div>
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.imported !== undefined && !state.error && (
        <p className="text-sm text-green-700 dark:text-green-400">
          Imported {state.imported} meeting{state.imported === 1 ? "" : "s"} and{" "}
          {state.people} {state.people === 1 ? "person" : "people"}. See the{" "}
          <Link href="/events" className="underline">Events</Link> page.
        </p>
      )}
      <div>
        <SubmitButton>Import events</SubmitButton>
      </div>
    </form>
  );
}
