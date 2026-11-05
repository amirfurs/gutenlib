import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";

export const metadata: Metadata = {
  title: "GutenLib",
  description: "Explore classic literature and world books with synchronized voice reading rooms",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      {/* Some browser extensions inject attributes into <body>, causing hydration warnings in dev. */}
      <body suppressHydrationWarning>
        <AnalyticsBeacon />
        <div className="min-h-screen bg-aurora">
          <Header />
          <div className="mx-auto max-w-6xl px-3 sm:px-4">
            <div className="py-4 sm:py-6">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
