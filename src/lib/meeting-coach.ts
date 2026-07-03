import "server-only";
import OpenAI from "openai";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

// Default to OpenAI's latest general model; override with OPENAI_MODEL if needed.
const MODEL = process.env.OPENAI_MODEL || "gpt-5";

// A to-do carried into prep, from a recent meeting with someone in the upcoming
// one. `sentToTodoist` is our best proxy for "already captured / in progress";
// items not sent are the more likely to be forgotten or still open.
export type CoachTodo = {
  text: string;
  sourceMeeting: string;
  sentToTodoist: boolean;
};

export type CoachInput = {
  meetingName: string;
  meetingDate: string; // human-readable, for context only
  attendees: { name: string; isMe: boolean }[];
  myItems: CoachTodo[];
  othersItems: (CoachTodo & { person: string })[];
};

export type CoachTopic = { title: string; detail: string };
export type CoachOpenItem = { text: string; why: string };
export type CoachQuestion = { from: string; question: string };

// The coaching briefing the model produces to help you walk in prepared.
export type MeetingCoaching = {
  summary: string;
  topics: CoachTopic[];
  myOpenItems: CoachOpenItem[];
  anticipatedQuestions: CoachQuestion[];
};

// strict mode: every property listed in `required`, additionalProperties:false.
const COACHING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      description:
        "2-3 sentences of direct, actionable coaching on how to make this meeting a success.",
    },
    topics: {
      type: "array",
      description: "Concrete topics to raise, grounded in the action items and history.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "Short topic label." },
          detail: {
            type: "string",
            description: "Why to raise it and what to cover, referencing specific items.",
          },
        },
        required: ["title", "detail"],
      },
    },
    myOpenItems: {
      type: "array",
      description:
        "The user's OWN commitments that still appear undone and should be completed or acknowledged before/at the meeting. Prefer items not yet sent to Todoist.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", description: "The user's action item." },
          why: { type: "string", description: "Why it matters for this meeting." },
        },
        required: ["text", "why"],
      },
    },
    anticipatedQuestions: {
      type: "array",
      description:
        "Things other attendees are likely to ask the user about — e.g. status of commitments the user owes them, or follow-ups on their own items.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          from: { type: "string", description: "Which attendee is likely to ask (their name)." },
          question: { type: "string", description: "The question they may raise." },
        },
        required: ["from", "question"],
      },
    },
  },
  required: ["summary", "topics", "myOpenItems", "anticipatedQuestions"],
} as const;

function formatItems(items: { text: string; sourceMeeting: string; sentToTodoist: boolean }[]) {
  if (items.length === 0) return "(none)";
  return items
    .map(
      (it) =>
        `- ${it.text} [from "${it.sourceMeeting}"; ${it.sentToTodoist ? "logged to Todoist" : "not logged — likely still open"}]`
    )
    .join("\n");
}

// Coach the user through an upcoming meeting using the action items gathered from
// their recent meetings with the same people. Returns a structured briefing.
export async function coachMeeting(input: CoachInput): Promise<MeetingCoaching> {
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

  const me = input.attendees.find((a) => a.isMe)?.name ?? "the user";
  const others = input.attendees.filter((a) => !a.isMe).map((a) => a.name);

  const othersItemsByPerson = input.othersItems.reduce<Record<string, CoachTodo[]>>((acc, it) => {
    (acc[it.person] ??= []).push(it);
    return acc;
  }, {});
  const othersBlock =
    Object.keys(othersItemsByPerson).length === 0
      ? "(none)"
      : Object.entries(othersItemsByPerson)
          .map(([person, items]) => `${person}:\n${formatItems(items)}`)
          .join("\n\n");

  const response = await client.responses.create({
    model: MODEL,
    input: [
      {
        role: "system",
        content:
          `You are a meeting-prep coach helping ${me} walk into an upcoming meeting fully prepared. ` +
          "You are given the meeting, its attendees, and the action items gathered from recent " +
          `meetings with those same people — split into ${me}'s own items and each other attendee's items. ` +
          "Each item notes whether it was logged to Todoist (a proxy for captured/in-progress) or not " +
          "(more likely still open). Produce: (1) a short, direct coaching summary; (2) concrete topics " +
          `to discuss; (3) ${me}'s own commitments that still look undone and should be closed or ` +
          "acknowledged (prefer items not logged to Todoist); and (4) questions the other attendees are " +
          "likely to ask about (status of what they're owed, or follow-ups on their items), attributed to " +
          "who would ask. Be specific and reference the actual items. Do not invent facts beyond the inputs. " +
          "Return empty arrays for any section with nothing to say.",
      },
      {
        role: "user",
        content:
          `Upcoming meeting: ${input.meetingName} (${input.meetingDate})\n` +
          `Attendees: ${[me, ...others].join(", ")}\n\n` +
          `${me}'s own open/recent action items:\n${formatItems(input.myItems)}\n\n` +
          `Other attendees' action items:\n${othersBlock}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "coaching",
        strict: true,
        schema: COACHING_SCHEMA,
      },
    },
  });

  return JSON.parse(response.output_text) as MeetingCoaching;
}
