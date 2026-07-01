// Shared Person upsert. People are deduplicated by email when one is known, so
// the same individual across many meetings/events is a single row. Attendees
// from the Fathom MCP sometimes have only a name (no email); those dedupe by
// name among the email-less rows. Returns null when neither is present.
import type { Prisma } from "@/generated/prisma/client";

export interface PersonInput {
  email: string | null;
  name: string | null;
}

/** Normalize for dedup: lowercased, trimmed; empty becomes null. */
function clean(value: string | null): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export async function upsertPerson(
  tx: Prisma.TransactionClient,
  input: PersonInput,
): Promise<{ id: number } | null> {
  const email = clean(input.email)?.toLowerCase() ?? null;
  const name = clean(input.name);

  if (email) {
    return tx.person.upsert({
      where: { email },
      // Only overwrite the name when we actually have one, so a later
      // email-only sighting doesn't blank a previously-captured name.
      create: { email, name },
      update: name ? { name } : {},
      select: { id: true },
    });
  }

  if (name) {
    const existing = await tx.person.findFirst({
      where: { email: null, name },
      select: { id: true },
    });
    return existing ?? tx.person.create({ data: { name }, select: { id: true } });
  }

  return null;
}
