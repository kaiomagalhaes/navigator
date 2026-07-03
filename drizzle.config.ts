import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "";
// Managed Postgres (Heroku) needs TLS with a self-signed cert; skip CA
// verification for remote hosts. Local Docker Postgres uses no TLS.
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  },
});
