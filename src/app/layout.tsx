import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";

export const metadata: Metadata = {
  title: "GutenLib",
  description: "Book library powered by Gutendex (Project Gutenberg catalog)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      {/* Some browser extensions inject attributes into <body>, causing hydration warnings in dev. */}
      <body suppressHydrationWarning>
        <AnalyticsBeacon />
        <div className="min-h-screen bg-aurora">
          <Header />
          <div className="mx-auto max-w-6xl px-4">
            <div className="py-6">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
