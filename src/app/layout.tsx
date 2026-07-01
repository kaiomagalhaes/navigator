import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
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
  description: "Fathom meeting data & AI processing hub",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <nav className="navbar">
          <Link href="/" className="brand">
            Navigator
          </Link>
          <div className="nav-links">
            <Link href="/">Today</Link>
            <Link href="/meetings">Meetings</Link>
            <Link href="/people">People</Link>
            <Link href="/chat">Chat</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
