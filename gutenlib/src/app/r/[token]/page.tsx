"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function InviteRedirectPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/room/${params.token}`);
  }, [params.token, router]);

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <p style={{ opacity: 0.75 }}>جاري التحويل…</p>
    </main>
  );
}
