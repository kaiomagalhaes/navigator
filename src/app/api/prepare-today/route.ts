import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { parseDayParam, dayWindow, toDateParam } from "@/lib/format";
import { listEventsForDay, listSkippedSeriesIds } from "@/db/queries";
import { generatePrep } from "@/lib/prepare";

export const dynamic = "force-dynamic";

// POST /api/prepare-today?date=YYYY-MM-DD
//
// Prepares every not-yet-prepared meeting on the given day (gather action items
// + AI coaching, stored on calendar_events.prep). Fired once per day by the home
// page. Sequential on purpose: each prepare makes several OpenAI calls, so we
// avoid hammering the API (same reason linkImportedEvents runs one at a time).
export async function POST(request: NextRequest) {
  // Defense in depth behind the proxy.
  if (!(await auth())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  const { dayStart, dayEnd } = dayWindow(parseDayParam(date));

  const events = await listEventsForDay(dayStart, dayEnd);
  // Recurring series the user marked "skip prep" are excluded from batch prep
  // (they can still be prepared manually from the event page).
  const skipped = await listSkippedSeriesIds();
  const pending = events.filter(
    (e) => e.prep == null && !(e.recurringEventId && skipped.has(e.recurringEventId))
  );

  let prepared = 0;
  for (const event of pending) {
    try {
      const result = await generatePrep(event.id);
      if (result.ran) prepared++;
    } catch (err) {
      console.error("[api/prepare-today]", toDateParam(dayStart), event.id, err);
    }
  }

  return NextResponse.json(
    { date: toDateParam(dayStart), prepared, total: events.length },
    { headers: { "Cache-Control": "no-store" } }
  );
}
