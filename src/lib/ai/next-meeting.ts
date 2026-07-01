// Generates a short markdown briefing of what to discuss next, from the last
// few meetings' summaries and action items, using GPT-5.5.
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { RecentMeeting } from "@/lib/fathom/todos";

const MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-5.5";

const SYSTEM = `You are a concise chief-of-staff for Kaio. From the user's last few meetings, suggest what to discuss in their NEXT meeting: open follow-ups, unresolved decisions, blockers, and threads worth revisiting.
Output GitHub-flavored markdown: one short intro sentence, then a bulleted list of at most 6 items. Each bullet is specific and references the relevant meeting in parentheses where useful. Be tight — no preamble, no headings.`;

export async function suggestNextMeetingTopics(
  meetings: RecentMeeting[],
): Promise<string> {
  if (meetings.length === 0) return "";

  const context = meetings
    .map((m, i) => {
      const items =
        m.actionItems
          .map(
            (a) =>
              `- [${a.completed ? "x" : " "}] ${a.description}${a.assigneeName ? ` (→ ${a.assigneeName})` : ""}`,
          )
          .join("\n") || "(none)";
      return `## Meeting ${i + 1}: ${m.title}${m.date ? ` (${m.date})` : ""}\nSummary:\n${m.summary ?? "(none)"}\n\nAction items:\n${items}`;
    })
    .join("\n\n---\n\n");

  const { text } = await generateText({
    model: openai(MODEL),
    system: SYSTEM,
    prompt: `My last ${meetings.length} meetings:\n\n${context}\n\nWhat should I discuss in my next meeting?`,
  });

  return text.trim();
}
