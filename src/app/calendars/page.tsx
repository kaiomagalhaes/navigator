import { disconnectAccount } from "@/app/actions";
import { listGoogleAccounts } from "@/db/queries";
import { ImportForm } from "@/components/import-form";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You declined access. Nothing was connected.",
  invalid_state: "The sign-in session expired. Please try connecting again.",
  exchange_failed: "Google sign-in failed. Please try again.",
};

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function CalendarsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const accounts = await listGoogleAccounts();
  const { connected, error } = await searchParams;

  // Default to the trailing week: only past meetings are imported (see
  // fetchMeetingEvents), so the range runs from 7 days ago to today.
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Connect Google accounts and import their meetings.
        </p>
      </div>

      {connected && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          Connected {connected}.
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {ERROR_MESSAGES[error] ?? "Something went wrong connecting the calendar."}
        </p>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">Connected calendars</h2>
          <a
            href="/api/google/connect"
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Connect Google Calendar
          </a>
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No calendars connected yet. Connect one to import meetings (read-only access).
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <span className="text-sm font-medium">{account.email}</span>
                <form action={disconnectAccount}>
                  <input type="hidden" name="accountId" value={account.id} />
                  <button
                    type="submit"
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    Disconnect
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {accounts.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-lg font-medium">Import meetings</h2>
          <ImportForm
            accounts={accounts}
            defaultFrom={toDateInput(weekAgo)}
            defaultTo={toDateInput(today)}
          />
        </section>
      )}
    </div>
  );
}
