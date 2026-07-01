import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvent } from "@/db/queries";
import { formatDateTime } from "@/lib/format";
import { FathomSyncForm } from "@/components/fathom-sync-form";
import type { FathomTranscriptEntry } from "@/lib/fathom-meetings";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) {
    notFound();
  }

  const participants = [...event.participants].sort((a, b) =>
    a.person.name.localeCompare(b.person.name)
  );

  const recording = event.fathomRecording;
  const transcript = (recording?.transcript ?? null) as FathomTranscriptEntry[] | null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/events" className="text-sm text-zinc-500 hover:underline">
            ← Events
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{event.name}</h1>
        </div>
        <FathomSyncForm eventId={event.id} />
      </div>

      <dl className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Starts</dt>
          <dd className="mt-1 font-medium">{formatDateTime(event.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Ends</dt>
          <dd className="mt-1 font-medium">{formatDateTime(event.endsAt)}</dd>
        </div>
      </dl>

      {recording && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium">Fathom recording</h2>
            {(recording.shareUrl || recording.url) && (
              <a
                href={recording.shareUrl ?? recording.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-zinc-900 underline dark:text-white"
              >
                View in Fathom ↗
              </a>
            )}
          </div>

          {recording.summary && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-xs uppercase tracking-wide text-zinc-500">Summary</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm">{recording.summary}</p>
            </div>
          )}

          {transcript && transcript.length > 0 && (
            <details className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <summary className="cursor-pointer text-sm font-medium">
                Transcript ({transcript.length} lines)
              </summary>
              <ul className="mt-4 flex flex-col gap-2">
                {transcript.map((entry, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-zinc-500">{entry.timestamp} </span>
                    <span className="font-medium">{entry.speaker}:</span>{" "}
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">
          Participants ({participants.length})
        </h2>

        {participants.length === 0 ? (
          <p className="text-sm text-zinc-500">No participants on this event.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {participants.map(({ person }) => (
              <li
                key={person.id}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <Link href={`/people/${person.id}`} className="hover:underline">
                  <span className="font-medium">{person.name}</span>
                  <span className="ml-2 text-sm text-zinc-500">{person.email}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
