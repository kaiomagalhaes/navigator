import "server-only";
import OpenAI from "openai";
import type { FathomTranscriptEntry } from "./fathom-meetings";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

// Default to OpenAI's latest general model; override with OPENAI_MODEL if needed.
const MODEL = process.env.OPENAI_MODEL || "gpt-5";

// A single extracted action item. `assignee` is the model's best guess at who
// owns the task, matched to a person downstream (see src/lib/todos.ts).
export type ExtractedActionItem = {
  text: string;
  assignee: string | null;
  // Timestamp copied verbatim from the transcript line where the item arises.
  timestamp: string | null;
};

// The JSON schema the model must fill. `strict` mode requires every property to
// be listed in `required` and `additionalProperties: false` throughout.
const TODOS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    todos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: {
            type: "string",
            description: "The action item as a concise, imperative task.",
          },
          assignee: {
            type: ["string", "null"],
            description:
              "Who is responsible. If the owner is one of the listed participants, use their exact email from the participant list. If the owner is someone mentioned but NOT in the participant list, use their name. Use null if the task has no clear owner.",
          },
          timestamp: {
            type: ["string", "null"],
            description:
              "The timestamp of the transcript line where this action item is raised or agreed, in the same format as the transcript but WITHOUT the surrounding brackets (e.g. \"00:12:34\"). Null only if it cannot be located.",
          },
        },
        required: ["text", "assignee", "timestamp"],
      },
    },
  },
  required: ["todos"],
} as const;

// Extract action items from a meeting transcript using OpenAI, attributing each
// to a participant where possible. Returns [] when the model finds no to-dos.
export async function extractTodos(input: {
  eventName: string;
  transcript: FathomTranscriptEntry[];
  participants: { name: string; email: string }[];
}): Promise<ExtractedActionItem[]> {
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

  const participantList = input.participants.length
    ? input.participants.map((p) => `- ${p.name} <${p.email}>`).join("\n")
    : "(no participant list available)";

  const transcriptText = input.transcript
    .map((e) => `[${e.timestamp}] ${e.speaker}: ${e.text}`)
    .join("\n");

  const response = await client.responses.create({
    model: MODEL,
    input: [
      {
        role: "system",
        content:
          "You extract concrete action items (to-dos) from meeting transcripts. " +
          "Only include real, actionable commitments made during the meeting — not " +
          "general discussion, opinions, or vague intentions. Phrase each as a short " +
          "imperative task. Attribute each task to whoever is responsible for doing it: " +
          "if that person is in the participant list, set assignee to their exact email " +
          "from that list; if they are someone mentioned but not a participant, use their " +
          "name; if no one clearly owns it, set assignee to null. For each item, also set " +
          "timestamp to the exact bracketed timestamp of the transcript line where it is " +
          "raised or agreed, copied verbatim. If there are no action items, return an " +
          "empty list.",
      },
      {
        role: "user",
        content:
          `Meeting: ${input.eventName}\n\n` +
          `Participants:\n${participantList}\n\n` +
          `Transcript:\n${transcriptText}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "todos",
        strict: true,
        schema: TODOS_SCHEMA,
      },
    },
  });

  const parsed = JSON.parse(response.output_text) as { todos: ExtractedActionItem[] };
  return parsed.todos ?? [];
}
