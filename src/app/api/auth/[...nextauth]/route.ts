import { handlers } from "@/auth";

// Auth.js mounts all its endpoints here: /api/auth/signin, /callback/google,
// /session, /csrf, /signout, etc.
export const { GET, POST } = handlers;
