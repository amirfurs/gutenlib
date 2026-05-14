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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning className="font-body">
        <AnalyticsBeacon />
        <div className="min-h-screen bg-aurora">
          <Header />
          <div className="mx-auto max-w-7xl px-6 md:px-12">
            <div className="py-6">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
