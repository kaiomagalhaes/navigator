// Centralized, validated access to environment variables.
// Scripts (tsx) load these via dotenv; Next.js loads .env automatically.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
  get syncLookbackHours() {
    return Number(optional("SYNC_LOOKBACK_HOURS", "26"));
  },
};
