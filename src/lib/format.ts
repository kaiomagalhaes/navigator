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
