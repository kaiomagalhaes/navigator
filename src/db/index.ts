import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema>;

// Reuse a single Pool/DB across hot reloads in development.
const globalForDb = globalThis as unknown as { pool?: Pool; db?: DB };

function initDb(): DB {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and start Postgres (docker compose up -d)."
    );
  }

  // Managed Postgres (Heroku) presents a self-signed cert over TLS; enable SSL
  // without CA verification for remote hosts. Local Docker Postgres uses no TLS.
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);

  const pool =
    globalForDb.pool ??
    new Pool({
      connectionString,
      ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
    });
  if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

  return drizzle(pool, { schema });
}

function resolveDb(): DB {
  return (globalForDb.db ??= initDb());
}

// Lazily initialize on first use so importing this module during the build
// (where DATABASE_URL is absent) neither connects nor throws — the connection
// is only established at runtime on the first query. Behaves like a normal
// Drizzle instance for callers.
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = resolveDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
