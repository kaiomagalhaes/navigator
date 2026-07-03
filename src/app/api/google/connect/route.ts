import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { buildConsentUrl } from "@/lib/google";

// Start the OAuth consent flow. A random state is stored in an httpOnly cookie
// and echoed back on the callback to defend against CSRF.
export async function GET(request: NextRequest) {
  // Defense in depth behind the proxy: only a signed-in user may connect a calendar.
  if (!(await auth())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildConsentUrl(state));
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 600, // 10 minutes to complete consent
  });
  return response;
}
