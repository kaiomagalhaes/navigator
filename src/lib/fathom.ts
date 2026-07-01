import "server-only";

// Fathom exposes a user-level API key (no OAuth). The key is passed on every
// request via the X-Api-Key header. See .env.example.
const DEFAULT_BASE_URL = "https://api.fathom.ai/external/v1";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

// Non-2xx responses from Fathom carry a status we surface so callers can map
// auth (401/403) and rate-limit (429) failures to actionable messages.
export class FathomApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "FathomApiError";
  }
}

// Thin fetch wrapper: prefixes the base URL, adds auth, parses JSON, and turns
// non-2xx responses into a typed FathomApiError.
export async function fathomFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const baseUrl = process.env.FATHOM_API_BASE_URL || DEFAULT_BASE_URL;
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": requireEnv("FATHOM_API_KEY"),
      Accept: "application/json",
      ...init?.headers,
    },
    // Meeting data is fetched on-demand from a Server Action; never cached.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new FathomApiError(
      res.status,
      `Fathom API ${res.status} on ${path}${body ? `: ${body.slice(0, 300)}` : ""}`
    );
  }

  return res.json() as Promise<T>;
}
