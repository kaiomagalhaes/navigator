"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, eventParticipants, persons } from "@/db/schema";

export type FormState = { error?: string };

export async function createEvent(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const endsAtRaw = String(formData.get("endsAt") ?? "");

  if (!name) return { error: "Name is required." };
  if (!startsAtRaw || !endsAtRaw) return { error: "Start and end times are required." };

  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { error: "Invalid date/time." };
  }
  if (endsAt < startsAt) {
    return { error: "End time must be after the start time." };
  }

  const [created] = await db
    .insert(calendarEvents)
    .values({ name, startsAt, endsAt })
    .returning({ id: calendarEvents.id });

  revalidatePath("/events");
  redirect(`/events/${created.id}`);
}

export async function createPerson(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!name) return { error: "Name is required." };
  if (!email) return { error: "Email is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  let created: { id: string };
  try {
    [created] = await db
      .insert(persons)
      .values({ name, email })
      .returning({ id: persons.id });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return { error: "A person with that email already exists." };
    }
    throw err;
  }

  revalidatePath("/people");
  redirect(`/people/${created.id}`);
}

export async function addParticipant(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  if (!eventId || !personId) return;

  await db
    .insert(eventParticipants)
    .values({ eventId, personId })
    .onConflictDoNothing();

  revalidatePath(`/events/${eventId}`);
}

export async function removeParticipant(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  if (!eventId || !personId) return;

  await db
    .delete(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.personId, personId)
      )
    );

  revalidatePath(`/events/${eventId}`);
}
