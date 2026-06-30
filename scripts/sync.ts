// CLI entry point for the daily sync: `npm run sync`.
// Loads .env (via dotenv) and runs the same core used by the cron route.
import "dotenv/config";
import { syncMeetings } from "@/lib/sync/sync-meetings";
import { prisma } from "@/lib/db";

async function main() {
  console.log("[sync] starting Fathom meeting sync…");
  const result = await syncMeetings();
  console.log(
    `[sync] done — fetched ${result.fetched}, matched ${result.matched}, upserted ${result.upserted}`,
  );
  for (const m of result.meetings) {
    console.log(`  • ${m.title} (recording_id=${m.recordingId})`);
  }
}

main()
  .catch((err) => {
    console.error("[sync] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
