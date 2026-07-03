// Production migration runner (used by the Heroku `release` phase).
// Uses the drizzle-orm migrator with a node-postgres Pool so SSL is handled
// exactly as the app does — the drizzle-kit CLI does not apply SSL to the
// connection-string form and stalls against managed (Heroku) Postgres.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// Managed Postgres needs TLS with a self-signed cert; local Docker Postgres does not.
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
const pool = new pg.Pool({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
});

try {
  await migrate(drizzle(pool), { migrationsFolder: "./src/db/migrations" });
  console.log("migrations applied");
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
