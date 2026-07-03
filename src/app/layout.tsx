import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { auth, signOut } from "@/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Navigator",
  description: "Calendar events and people",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The proxy gates access; here we only decide whether to show the app nav.
  // Signed-out views (the login page) render without it.
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
        {session && (
          <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <nav className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
              <Link href="/" className="font-semibold tracking-tight">
                Navigator
              </Link>
              <div className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
                <Link href="/events" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                  Events
                </Link>
                <Link href="/todos" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                  To Dos
                </Link>
                <Link href="/people" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                  People
                </Link>
                <Link href="/calendars" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                  Calendars
                </Link>
              </div>
              <div className="ml-auto flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                <span className="hidden sm:inline">{session.user?.email}</span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button
                    type="submit"
                    className="hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    Log out
                  </button>
                </form>
              </div>
            </nav>
          </header>
        )}
        <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
