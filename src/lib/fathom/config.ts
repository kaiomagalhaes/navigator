// Fathom integration configuration.

export const FATHOM_BASE_URL = "https://api.fathom.ai/external/v1";

/**
 * The two identities we sync meetings for. A meeting is kept when either email
 * is the recorder OR a calendar invitee. Hard-coded per product requirement.
 * Compared case-insensitively against Fathom data.
 */
export const TARGET_EMAILS = [
  "kaio@codelitt.com",
  "kaio@carboncrei.com",
] as const;

const TARGET_EMAIL_SET = new Set(
  TARGET_EMAILS.map((email) => email.toLowerCase()),
);

/**
 * Display name(s) the target identities appear under. The MCP `list_meetings`
 * text exposes recorders/invitees by name, not email, so we also match on name.
 * Both target emails belong to this person.
 */
export const TARGET_NAMES = ["Kaio Magalhães"] as const;

const TARGET_NAME_SET = new Set(TARGET_NAMES.map((n) => n.toLowerCase()));

/**
 * Match a recorder/invitee token that may be either a name or an email
 * (the MCP returns a mix). Used by the MCP source to decide which meetings
 * involve one of the target identities.
 */
export function isTargetToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const t = token.trim().toLowerCase();
  return TARGET_EMAIL_SET.has(t) || TARGET_NAME_SET.has(t);
}
