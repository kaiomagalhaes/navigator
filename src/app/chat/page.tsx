"use client";

// Ephemeral chat: conversation lives only in component state — refreshing the
// page clears it, and nothing is persisted server-side.
import { useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import type { UIMessage, UIMessagePart, UIDataTypes, UITools } from "ai";
import { Markdown } from "../markdown";

const SUGGESTIONS = [
  "What were my meetings about this week?",
  "Summarize my last meeting with action items.",
  "What did I discuss with Michael?",
];

function toolName(part: UIMessagePart<UIDataTypes, UITools>): string | null {
  if (part.type === "dynamic-tool") return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice(5);
  return null;
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
  const tools = Array.from(
    new Set(
      message.parts.map(toolName).filter((n): n is string => n !== null),
    ),
  );

  return (
    <div className={`msg msg-${message.role}`}>
      {tools.length > 0 && (
        <div className="msg-tools">
          {tools.map((t) => (
            <span key={t} className="tool-chip">
              🔧 {t}
            </span>
          ))}
        </div>
      )}
      {text &&
        (message.role === "assistant" ? (
          <Markdown>{text}</Markdown>
        ) : (
          <div className="msg-text">{text}</div>
        ))}
    </div>
  );
}

export default function ChatPage() {
  const { messages, sendMessage, status, stop } = useChat();
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <main className="page chat-page">
      <Link href="/" className="back-link">
        ← All meetings
      </Link>
      <header className="header">
        <h1>Chat</h1>
        <p className="subtitle">
          Ask about your meetings. Answers come from Fathom in real time; this
          conversation isn&apos;t saved.
        </p>
      </header>

      <div className="chat-log">
        {messages.length === 0 ? (
          <div className="chat-empty">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="suggestion"
                onClick={() => submit(s)}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {status === "submitted" && (
          <div className="msg msg-assistant">
            <div className="msg-text muted">Thinking…</div>
          </div>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your meetings…"
          autoFocus
        />
        {busy ? (
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
    </main>
  );
}
