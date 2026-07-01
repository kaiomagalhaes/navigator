import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { googleAccounts } from "@/db/schema";
import { encryptToken, exchangeCodeForAccount } from "@/lib/google";

function backTo(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/calendars", request.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const cookieState = request.cookies.get("google_oauth_state")?.value;

  if (error) return backTo(request, { error });
  if (!code || !state || !cookieState || state !== cookieState) {
    return backTo(request, { error: "invalid_state" });
  }

  try {
    const account = await exchangeCodeForAccount(code);

    await db
      .insert(googleAccounts)
      .values({
        email: account.email,
        accessToken: encryptToken(account.accessToken),
        refreshToken: encryptToken(account.refreshToken),
        tokenExpiry: account.expiryDate,
        scope: account.scope,
      })
      .onConflictDoUpdate({
        target: googleAccounts.email,
        set: {
          accessToken: encryptToken(account.accessToken),
          refreshToken: encryptToken(account.refreshToken),
          tokenExpiry: account.expiryDate,
          scope: account.scope,
        },
      });

    const response = backTo(request, { connected: account.email });
    response.cookies.delete("google_oauth_state");
    return response;
  } catch (err) {
    console.error("[google/callback]", err);
    return backTo(request, { error: "exchange_failed" });
  }
}
