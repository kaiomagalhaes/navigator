import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { parseDayParam, dayWindow, toDateParam } from "@/lib/format";
import { syncDay } from "@/lib/day-sync";

export const dynamic = "force-dynamic";

// GET /api/day-sync?date=YYYY-MM-DD
//
// Pulls the given day's meetings from Google and reconciles the DB, but only
// writes (and reports changed:true) when something actually changed. Polled
// once a minute by the home page to keep the visible day fresh.
export async function GET(request: NextRequest) {
  // Defense in depth behind the proxy.
  if (!(await auth())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  const dayStart = parseDayParam(date);
  const { dayEnd } = dayWindow(dayStart);
  const dateKey = toDateParam(dayStart);

  try {
    const { changed, lastSyncedAt } = await syncDay(dayStart, dayEnd, dateKey);
    return NextResponse.json(
      { changed, lastSyncedAt: lastSyncedAt.toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[api/day-sync]", err);
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}
