// Your own email addresses. Attendee lists hide these so a meeting reads as
// "who else was there". Add more here if you connect additional accounts.
export const MY_EMAILS = new Set(["kaio@codelitt.com", "kaio@carboncrei.com"]);

export function isMe(email: string): boolean {
  return MY_EMAILS.has(email.toLowerCase());
}
