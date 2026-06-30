// Landing page. Navigation lives in the global navbar (see layout.tsx).
import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <header className="header">
        <h1>Navigator</h1>
        <p className="subtitle">Fathom meeting data &amp; AI processing hub</p>
      </header>
      <p className="muted">
        Go to <Link href="/meetings">Meetings</Link> to browse and sync, or{" "}
        <Link href="/chat">Chat</Link> to ask about them.
      </p>
    </main>
  );
}
