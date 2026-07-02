import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { todos } from "@/db/schema";
import { extractTodos } from "./extract-todos";
import type { FathomTranscriptEntry } from "./fathom-meetings";

type EventWithContext = {
  id: string;
  name: string;
  participants: { person: { id: string; name: string; email: string } }[];
  fathomRecording: { transcript: unknown } | null;
};

// Resolve the model's free-text assignee to a participant. The model may return
// a full email, an email local-part, a full name, or just a first name, so we
// try progressively looser matches. Exact matches (email / email local-part /
// full name) win outright; the looser first-name/token match only applies when
// it uniquely identifies a single participant, to avoid mis-assigning when two
// people share a first name. Returns null when nothing matches (→ "Unassigned").
function matchPerson(
  assignee: string | null,
  participants: EventWithContext["participants"]
): string | null {
  if (!assignee) return null;
  const needle = assignee.trim().toLowerCase();
  if (!needle) return null;

  // Exact: full email, email local-part (before @), or full name.
  const exact = participants.find(({ person }) => {
    const email = person.email.toLowerCase();
    return email === needle || email.split("@")[0] === needle || person.name.toLowerCase() === needle;
  });
  if (exact) return exact.person.id;

  // Loose: a name token (e.g. "kaio" → "Kaio Magalhaes") or an email local-part
  // token (e.g. "michael" → "michael.efantis@…"). Only accept a unique hit.
  const loose = participants.filter(({ person }) => {
    const nameTokens = person.name.toLowerCase().split(/\s+/);
    const emailTokens = person.email.toLowerCase().split("@")[0].split(/[._-]/);
    return nameTokens.includes(needle) || emailTokens.includes(needle);
  });
  if (loose.length === 1) return loose[0].person.id;

  return null;
}

// Re-extract an event's to-dos from its transcript and persist them, replacing
// any previously extracted set (delete-then-insert in one transaction). Returns
// the number of to-dos stored. The caller must ensure a transcript exists.
export async function regenerateEventTodos(event: EventWithContext): Promise<number> {
  const transcript = (event.fathomRecording?.transcript ?? null) as
    | FathomTranscriptEntry[]
    | null;

  if (!transcript || transcript.length === 0) {
    throw new Error("Event has no transcript to extract to-dos from.");
  }

  const extracted = await extractTodos({
    eventName: event.name,
    transcript,
    participants: event.participants.map((p) => p.person),
  });

  const rows = extracted
    .map((item) => ({
      text: item.text?.trim() ?? "",
      assignee: item.assignee,
      timestamp: item.timestamp,
    }))
    .filter((item) => item.text.length > 0)
    .map((item) => {
      const personId = matchPerson(item.assignee, event.participants);
      return {
        eventId: event.id,
        personId,
        // Keep the raw assignee only when we could not tie it to a person.
        assigneeName: personId ? null : item.assignee?.trim() || null,
        text: item.text,
        // Normalize to bare digits/colons ("[00:19:02]" → "00:19:02") so it
        // matches the transcript entries' timestamp format for deep-linking.
        transcriptTimestamp: item.timestamp?.replace(/[^\d:]/g, "") || null,
      };
    });

  await db.transaction(async (tx) => {
    await tx.delete(todos).where(eq(todos.eventId, event.id));
    if (rows.length > 0) {
      await tx.insert(todos).values(rows);
    }
  });

  return rows.length;
}
