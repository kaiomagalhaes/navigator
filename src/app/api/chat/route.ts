// Ephemeral meeting chatbot. Streams a GPT-5.5 response that can call the Fathom
// MCP tools to ground its answers in the user's real meetings. Nothing is
// persisted — the full conversation is sent from the client each request.
import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { createFathomTools } from "@/lib/chat/fathom-tools";

export const maxDuration = 60;

const MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-5.5";

const SYSTEM = `You are Navigator, an assistant that answers questions about the user's Fathom meetings.
The user is Kaio Magalhães (kaio@codelitt.com / kaio@carboncrei.com).

Use the available Fathom tools to look things up before answering:
- search_meetings for topic/keyword questions,
- list_meetings for time-range or "recent meetings" questions (recorded_by Kaio's emails for "my recordings"),
- find_person to find meetings involving a specific person,
- get_meeting_transcript / get_meeting_summary for details about a specific meeting.

Ground every factual claim about a meeting in tool results — never invent meeting content, attendees, or quotes.
Reference meetings by their title and date. If the tools return nothing relevant, say so plainly.
Be concise.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const { tools, close } = await createFathomTools();
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openai(MODEL),
    system: SYSTEM,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(10),
    onFinish: () => {
      void close();
    },
    onError: () => {
      void close();
    },
  });

  return result.toUIMessageStreamResponse();
}
