// Vercel project configuration. Registers the daily Fathom sync cron, which
// hits /api/cron/sync. Vercel automatically sends `Authorization: Bearer
// $CRON_SECRET`, which the route validates. Not used for local development.
import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [{ path: "/api/cron/sync", schedule: "0 6 * * *" }],
};
