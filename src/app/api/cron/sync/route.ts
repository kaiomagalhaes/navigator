// Sync endpoint. Guarded by CRON_SECRET so it can be safely wired to Vercel Cron
// (which sends `Authorization: Bearer <CRON_SECRET>`) once deployed.
import { NextResponse } from "next/server";
import { syncMeetings } from "@/lib/sync/sync-meetings";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${env.cronSecret}`;
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncMeetings();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Vercel Cron issues GET; POST supported for manual triggering.
export const GET = handle;
export const POST = handle;
