import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Navigator</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Track calendar events and the people who participate in them.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/events"
          className="rounded-xl border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <h2 className="text-lg font-medium">Events →</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Browse and create calendar events, and manage their participants.
          </p>
        </Link>
        <Link
          href="/people"
          className="rounded-xl border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <h2 className="text-lg font-medium">People →</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Browse and add people, and see the events they participated in.
          </p>
        </Link>
      </div>
    </div>
  );
}
