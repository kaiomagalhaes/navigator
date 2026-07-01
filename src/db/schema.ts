import { pgTable, uuid, text, timestamp, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// A connected Google account whose calendar we import from. Tokens are stored
// encrypted (AES-256-GCM) — never in plaintext. See src/lib/google.ts.
export const googleAccounts = pgTable("google_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }).notNull(),
  scope: text("scope").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    // Provenance for imported events. Manually created events leave these null.
    accountId: uuid("account_id").references(() => googleAccounts.id, { onDelete: "set null" }),
    googleEventId: text("google_event_id"),
    organizerEmail: text("organizer_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Idempotent import: an event from a given account is upserted, not duplicated.
    uniqueIndex("calendar_events_account_google_event_idx").on(table.accountId, table.googleEventId),
  ]
);

export const persons = pgTable("persons", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Join table: a person participates in an event (many-to-many).
export const eventParticipants = pgTable(
  "event_participants",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.personId] })]
);

export const calendarEventsRelations = relations(calendarEvents, ({ one, many }) => ({
  participants: many(eventParticipants),
  account: one(googleAccounts, {
    fields: [calendarEvents.accountId],
    references: [googleAccounts.id],
  }),
}));

export const googleAccountsRelations = relations(googleAccounts, ({ many }) => ({
  events: many(calendarEvents),
}));

export const personsRelations = relations(persons, ({ many }) => ({
  participations: many(eventParticipants),
}));

export const eventParticipantsRelations = relations(eventParticipants, ({ one }) => ({
  event: one(calendarEvents, {
    fields: [eventParticipants.eventId],
    references: [calendarEvents.id],
  }),
  person: one(persons, {
    fields: [eventParticipants.personId],
    references: [persons.id],
  }),
}));

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type Person = typeof persons.$inferSelect;
export type EventParticipant = typeof eventParticipants.$inferSelect;
export type GoogleAccount = typeof googleAccounts.$inferSelect;
