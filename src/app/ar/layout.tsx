import type { ReactNode } from "react";

export default function ArabicLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="min-h-[calc(100vh-56px)]">
      {children}
    </div>
  );
}
