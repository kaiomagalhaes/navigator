import "server-only";

// Todoist exposes a personal API token (no OAuth) passed as a Bearer token on
// every request. The legacy REST v2 / Sync v9 APIs are deprecated (HTTP 410);
// everything here uses the unified API under /api/v1/. See .env.example.
const BASE_URL = "https://api.todoist.com/api/v1";

// A single task, normalized down to what the To Dos page renders.
export type TodoistTask = {
  id: string;
  content: string;
  // Todoist priority is 1 (natural, lowest) … 4 (urgent, shown as "p1").
  priority: number;
  // Human-readable due ("today", "every 2nd", …) or the ISO date as a fallback.
  due: string | null;
  // Raw ISO date ("YYYY-MM-DD") the task is due, for flagging overdue items.
  dueDate: string | null;
  isRecurring: boolean;
  url: string;
};

// Non-2xx responses carry a status so callers can distinguish auth failures
// (401/403) from everything else.
export class TodoistApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "TodoistApiError";
  }
}

// Raw shape of a task in the v1 API (only the fields we read).
type RawTask = {
  id: string;
  content: string;
  project_id?: string;
  priority?: number;
  is_deleted?: boolean;
  due?: { date?: string | null; string?: string | null; is_recurring?: boolean } | null;
};
type FilterResponse = { results: RawTask[]; next_cursor?: string | null };

function normalize(t: RawTask): TodoistTask {
  return {
    id: t.id,
    content: t.content,
    priority: t.priority ?? 1,
    due: t.due?.string ?? t.due?.date ?? null,
    dueDate: t.due?.date ?? null,
    isRecurring: t.due?.is_recurring ?? false,
    url: `https://app.todoist.com/app/task/${t.id}`,
  };
}

async function todoistFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) throw new Error("TODOIST_API_TOKEN is not set. See .env.example.");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...init?.headers },
    // Personal tasks change constantly and are read per-request; never cache.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TodoistApiError(
      res.status,
      `Todoist API ${res.status} on ${path}${body ? `: ${body.slice(0, 300)}` : ""}`
    );
  }

  // Mutating endpoints (e.g. /close) reply 204 with an empty body.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// The configured "work" projects. When TODOIST_PROJECT_IDS is set
// (comma-separated), task queries are limited to these projects (sub-projects
// excluded); empty means all projects.
function workProjectIds(): Set<string> {
  return new Set(
    (process.env.TODOIST_PROJECT_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

// Run a Todoist smart-filter query, restricted to the work projects, paging
// through next_cursor so a heavy backlog isn't silently truncated (capped at a
// generous number of pages as a runaway guard). Results are sorted oldest due
// date first, then by priority (4 → 1); tasks with no date sort last.
async function listTasksMatching(filter: string): Promise<TodoistTask[]> {
  const projectIds = workProjectIds();
  const tasks: TodoistTask[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({ query: filter });
    if (cursor) query.set("cursor", cursor);
    const data: FilterResponse = await todoistFetch(`/tasks/filter?${query}`);

    for (const raw of data.results) {
      if (raw.is_deleted) continue;
      if (projectIds.size > 0 && !(raw.project_id && projectIds.has(raw.project_id))) continue;
      tasks.push(normalize(raw));
    }

    cursor = data.next_cursor ?? null;
    if (!cursor) break;
  }

  return tasks.sort((a, b) => {
    const da = a.dueDate ?? "9999-99-99";
    const db = b.dueDate ?? "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    return b.priority - a.priority;
  });
}

// Every work-project task due today or overdue (home and To Dos pages).
export async function listTasksDueTodayOrOverdue(): Promise<TodoistTask[]> {
  return listTasksMatching("today | overdue");
}

// Complete (close) a task in Todoist. For a recurring task this advances it to
// its next occurrence rather than deleting it — matching Todoist's own behavior.
// Replies 204 with no body; a non-2xx throws a TodoistApiError.
export async function completeTask(id: string): Promise<void> {
  await todoistFetch<void>(`/tasks/${encodeURIComponent(id)}/close`, { method: "POST" });
}

// The project new tasks are created in — the first of TODOIST_PROJECT_IDS, so
// copied to-dos land in the same project the page reads from. Undefined (→ the
// Todoist Inbox) when no project is configured.
export function primaryProjectId(): string | undefined {
  return (process.env.TODOIST_PROJECT_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)[0];
}

// Create a task in Todoist. `dueString` accepts Todoist's natural-language due
// syntax ("today", "tomorrow", …). Returns the created task, normalized.
export async function createTask(input: {
  content: string;
  dueString?: string;
  projectId?: string;
}): Promise<TodoistTask> {
  const body: Record<string, unknown> = { content: input.content };
  if (input.dueString) body.due_string = input.dueString;
  if (input.projectId) body.project_id = input.projectId;

  const raw = await todoistFetch<RawTask>("/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return normalize(raw);
}
