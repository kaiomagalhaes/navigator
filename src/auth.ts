import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// The one Google account allowed to sign in. Kept as an explicit constant so
// the "only this account" guarantee is visible in the code. This is app login,
// distinct from lib/me.ts (hides your own email in attendee lists) and
// lib/google.ts (connects calendars to import from).
export const ALLOWED_EMAIL = "kaio@codelitt.com";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Reuse the existing Google OAuth app credentials (see .env). Auth.js adds its
  // own callback route at /api/auth/callback/google — register that in GCP.
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  // Custom sign-in / error screen instead of Auth.js's default pages.
  pages: {
    signIn: "/login",
    error: "/login",
  },
  // No database adapter → stateless JWT session in an encrypted cookie. The
  // session cookie is persistent (survives browser restarts) and rolls forward
  // on each visit, so regular use never requires re-signing in. Requires a
  // stable AUTH_SECRET in .env — a changing secret invalidates existing cookies.
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 90, // 90 days of inactivity before the session expires
    updateAge: 60 * 60 * 24, // refresh the cookie's expiry at most once per day
  },
  // Custom dev port (3001) → trust the incoming host instead of a fixed AUTH_URL.
  trustHost: true,
  callbacks: {
    // Only the allowed account may complete sign-in. Any other Google account
    // is rejected and bounced to /login?error=AccessDenied.
    signIn({ profile }) {
      return profile?.email?.toLowerCase() === ALLOWED_EMAIL;
    },
  },
});
