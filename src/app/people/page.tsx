// People directory — every person captured from meetings and calendar events,
// searchable by name or email. People persist even after their meetings/events
// are deleted, so this is the durable record of who we've met with.
import Link from "next/link";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const where: Prisma.PersonWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};

  const people = await prisma.person.findMany({
    where,
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: 200,
    include: { _count: { select: { meetings: true, events: true } } },
  });

  return (
    <main className="page">
      <header className="header">
        <h1>People</h1>
        <p className="subtitle">Everyone across meetings and calendar events</p>
      </header>

      <form method="get" className="people-search" role="search">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by name or email…"
          aria-label="Search people by name or email"
          autoComplete="off"
        />
        <button type="submit">Search</button>
        {query && (
          <Link href="/people" className="people-clear">
            Clear
          </Link>
        )}
      </form>

      {people.length === 0 ? (
        <p className="empty">
          {query
            ? `No people match “${query}”.`
            : "No people yet. Refresh today's meetings or sync from Fathom."}
        </p>
      ) : (
        <table className="meetings">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th className="num">Meetings</th>
              <th className="num">Events</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/people/${p.id}`}>{p.name ?? "—"}</Link>
                </td>
                <td>{p.email ?? "—"}</td>
                <td className="num">{p._count.meetings}</td>
                <td className="num">{p._count.events}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
