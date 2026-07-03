import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Paths reachable without a session. Auth.js's own endpoints (/api/auth/*) must
// always pass through so sign-in/callback/signout can work.
const PUBLIC_PATHS = new Set(["/login"]);

// App-wide authentication gate (Next.js 16 renamed Middleware → Proxy). The
// `auth` wrapper injects the session as `req.auth`. This is the primary gate;
// protected route handlers also re-check the session (defense in depth).
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/auth")) return NextResponse.next();
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (req.auth) return NextResponse.next();

  // Unauthenticated: JSON 401 for APIs, redirect to the login page otherwise.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
});

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
