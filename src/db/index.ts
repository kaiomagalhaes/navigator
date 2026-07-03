import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and start Postgres (docker compose up -d).");
}

// Reuse a single Pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pool?: Pool };

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

export const db = drizzle(pool, { schema });
