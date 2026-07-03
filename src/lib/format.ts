const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

// "9:30 AM"
export function formatTime(value: Date | string): string {
  return timeFormatter.format(new Date(value));
}

// "Thursday, July 2"
export function formatDay(value: Date | string): string {
  return dayFormatter.format(new Date(value));
}

export function formatDateTime(value: Date | string): string {
  return dateTimeFormatter.format(new Date(value));
}

export function formatDate(value: Date | string): string {
  return dateFormatter.format(new Date(value));
}

export function formatRange(start: Date | string, end: Date | string): string {
  return `${formatDateTime(start)} – ${formatDateTime(end)}`;
}

// "2026-07-03" in the *local* timezone (unlike Date#toISOString, which is UTC
// and can land on the wrong day). Used for the ?date= param and <input type="date">.
export function toDateParam(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Local midnight for a "YYYY-MM-DD" param; today's local midnight when the param
// is missing or malformed. Shared by the home page and the day-sync route so
// both compute the exact same local-day window.
export function parseDayParam(value: string | undefined): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return today;
  const parsed = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(parsed.getTime()) ? today : parsed;
}

// The [start, end) local-day window for a day's midnight.
export function dayWindow(dayStart: Date): { dayStart: Date; dayEnd: Date } {
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayStart.getDate() + 1);
  return { dayStart, dayEnd };
}
