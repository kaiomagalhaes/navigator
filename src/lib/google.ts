import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleAccounts, type GoogleAccount } from "@/db/schema";

// Read-only calendar access + the account's email address (to key the connection).
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

export function createOAuthClient() {
  return new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
    requireEnv("GOOGLE_REDIRECT_URI")
  );
}

// ---- Token encryption at rest (AES-256-GCM) --------------------------------

function encryptionKey(): Buffer {
  const key = Buffer.from(requireEnv("GOOGLE_TOKEN_ENC_KEY"), "hex");
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENC_KEY must be a 32-byte hex string (64 hex chars).");
  }
  return key;
}

// Stored as "iv:authTag:ciphertext", all hex.
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

export function decryptToken(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

// ---- OAuth flow helpers ----------------------------------------------------

export function buildConsentUrl(state: string): string {
  return createOAuthClient().generateAuthUrl({
    access_type: "offline", // required to receive a refresh token
    prompt: "consent", // force refresh-token issuance even on re-connect
    scope: GOOGLE_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

// Exchange the auth code for tokens and read which account granted access.
export async function exchangeCodeForAccount(code: string): Promise<{
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: Date;
  scope: string;
}> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("Google did not return an access token.");
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke access at myaccount.google.com and reconnect."
    );
  }
  client.setCredentials(tokens);

  const { data } = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
  if (!data.email) throw new Error("Could not read the Google account email.");

  return {
    email: data.email.toLowerCase(),
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
    scope: tokens.scope ?? GOOGLE_SCOPES.join(" "),
  };
}

// Return an authenticated OAuth client for an account, refreshing + persisting
// the access token when it has expired (or is about to, within 60s).
export async function getAuthedClient(account: GoogleAccount) {
  const client = createOAuthClient();
  client.setCredentials({
    access_token: decryptToken(account.accessToken),
    refresh_token: decryptToken(account.refreshToken),
    expiry_date: account.tokenExpiry.getTime(),
  });

  const expiresSoon = account.tokenExpiry.getTime() - 60_000 <= Date.now();
  if (expiresSoon) {
    const { credentials } = await client.refreshAccessToken();
    if (credentials.access_token) {
      await db
        .update(googleAccounts)
        .set({
          accessToken: encryptToken(credentials.access_token),
          tokenExpiry: new Date(credentials.expiry_date ?? Date.now() + 3600_000),
          // Google usually omits a new refresh token on refresh; keep the old one otherwise.
          ...(credentials.refresh_token
            ? { refreshToken: encryptToken(credentials.refresh_token) }
            : {}),
        })
        .where(eq(googleAccounts.id, account.id));
      client.setCredentials(credentials);
    }
  }

  return client;
}
