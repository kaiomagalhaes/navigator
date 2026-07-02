"use client";

import { useEffect, useState } from "react";
import type { FathomTranscriptEntry } from "@/lib/fathom-meetings";

// Collapsible transcript. When a to-do links to "#ts-<index>", this opens the
// transcript (if collapsed), scrolls that line into view, and highlights it.
export function TranscriptViewer({ entries }: { entries: FathomTranscriptEntry[] }) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    function jumpToHash() {
      const hash = window.location.hash;
      if (!hash.startsWith("#ts-")) return;
      const id = hash.slice(1);
      setOpen(true);
      setActiveId(id);
      // Let the <details> render open before scrolling to the line inside it.
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    jumpToHash();
    window.addEventListener("hashchange", jumpToHash);
    return () => window.removeEventListener("hashchange", jumpToHash);
  }, []);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <summary className="cursor-pointer text-sm font-medium">
        Transcript ({entries.length} lines)
      </summary>
      <ul className="mt-4 flex flex-col gap-1">
        {entries.map((entry, i) => {
          const id = `ts-${i}`;
          return (
            <li
              key={i}
              id={id}
              className={`scroll-mt-24 rounded-md px-2 py-1 text-sm transition-colors ${
                activeId === id ? "bg-yellow-100 dark:bg-yellow-900/40" : ""
              }`}
            >
              <span className="text-zinc-500">{entry.timestamp} </span>
              <span className="font-medium">{entry.speaker}:</span>{" "}
              <span>{entry.text}</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
