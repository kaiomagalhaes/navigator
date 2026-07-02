import { Fragment, type ReactNode } from "react";

// Minimal inline-markdown renderer for short to-do strings: links, bold,
// italic, inline code and strikethrough. This is deliberately NOT a full
// CommonMark parser — just the inline constructs that show up in Todoist tasks
// and transcript-extracted to-dos, rendered inline (no block <p>/list wrapping
// that would break the surrounding flex layout). It emits React nodes rather
// than HTML, so it is XSS-safe by construction.

type Rule = {
  regex: RegExp;
  render: (m: RegExpExecArray) => ReactNode;
};

const rules: Rule[] = [
  {
    // [label](https://url)
    regex: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/,
    render: (m) => (
      <a
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:no-underline"
      >
        {keyed(parseInline(m[1]))}
      </a>
    ),
  },
  {
    // `code`
    regex: /`([^`]+)`/,
    render: (m) => (
      <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-zinc-800">
        {m[1]}
      </code>
    ),
  },
  {
    // **bold** or __bold__
    regex: /\*\*([^*]+)\*\*|__([^_]+)__/,
    render: (m) => <strong>{keyed(parseInline(m[1] ?? m[2]))}</strong>,
  },
  {
    // ~~strikethrough~~
    regex: /~~([^~]+)~~/,
    render: (m) => <s>{keyed(parseInline(m[1]))}</s>,
  },
  {
    // *italic* or _italic_
    regex: /\*([^*]+)\*|_([^_]+)_/,
    render: (m) => <em>{keyed(parseInline(m[1] ?? m[2]))}</em>,
  },
];

// Split `text` into plain strings and rendered elements by repeatedly matching
// whichever rule appears earliest, then recursing on the remainder.
function parseInline(text: string): ReactNode[] {
  let earliest: { index: number; m: RegExpExecArray; rule: Rule } | null = null;
  for (const rule of rules) {
    const m = rule.regex.exec(text);
    if (m && (earliest === null || m.index < earliest.index)) {
      earliest = { index: m.index, m, rule };
    }
  }
  if (!earliest) return text ? [text] : [];

  const { index, m, rule } = earliest;
  const nodes: ReactNode[] = [];
  if (index > 0) nodes.push(text.slice(0, index));
  nodes.push(rule.render(m));
  nodes.push(...parseInline(text.slice(index + m[0].length)));
  return nodes;
}

// Give each sibling node a stable key from its position in the array.
function keyed(nodes: ReactNode[]): ReactNode[] {
  return nodes.map((node, i) => <Fragment key={i}>{node}</Fragment>);
}

export function MarkdownText({ children }: { children: string }) {
  return <>{keyed(parseInline(children))}</>;
}
