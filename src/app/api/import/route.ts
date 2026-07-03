import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { auth } from "@/auth";
import { importCalendarRange } from "@/lib/import-events";

export const dynamic = "force-dynamic";

// GET /api/import?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Pulls calendar meetings in [from, to] from every connected Google account and
// auto-links each to its Fathom recording (when one exists). Idempotent: safe
// to call repeatedly for the same window — events are upserted, not duplicated.
export async function GET(request: NextRequest) {
  // Defense in depth: the proxy already gates this, but never trust that alone.
  if (!(await auth())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const fromRaw = searchParams.get("from") ?? "";
  const toRaw = searchParams.get("to") ?? "";

  if (!fromRaw || !toRaw) {
    return NextResponse.json(
      { error: "Pass `from` and `to` as YYYY-MM-DD, e.g. ?from=2026-06-01&to=2026-06-30." },
      { status: 400 }
    );
  }

  const from = new Date(`${fromRaw}T00:00:00`);
  const to = new Date(`${toRaw}T23:59:59`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 });
  }
  if (to < from) {
    return NextResponse.json({ error: "`to` must be on or after `from`." }, { status: 400 });
  }

  const accounts = await db.query.googleAccounts.findMany();
  if (accounts.length === 0) {
    return NextResponse.json({ error: "No Google calendars connected." }, { status: 400 });
  }

  // Import each account independently so one failure doesn't sink the others.
  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        const summary = await importCalendarRange(account, from, to);
        return { email: account.email, ...summary };
      } catch (err) {
        console.error("[api/import]", account.email, err);
        const message = err instanceof Error ? err.message : "Import failed.";
        return { email: account.email, error: message };
      }
    })
  );

  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/people");
  revalidatePath("/calendars");

  const totals = results.reduce(
    (acc, r) => ({
      imported: acc.imported + ("imported" in r ? r.imported : 0),
      people: acc.people + ("people" in r ? r.people : 0),
      linked: acc.linked + ("linked" in r ? r.linked : 0),
    }),
    { imported: 0, people: 0, linked: 0 }
  );

  return NextResponse.json({
    range: { from: fromRaw, to: toRaw },
    accounts: results,
    totals,
  });
}
