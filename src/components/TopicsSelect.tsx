"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function TopicsSelect() {
  const router = useRouter();
  const sp = useSearchParams();

  const [topics, setTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const current = sp.get("topic") ?? "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/topics");
        const json = await res.json();
        if (!cancelled) setTopics((json.topics ?? []) as string[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => ["", ...topics], [topics]);

  return (
    <select
      value={current}
      onChange={(e) => {
        const next = e.target.value;
        const qs = new URLSearchParams(sp.toString());
        if (next) qs.set("topic", next);
        else qs.delete("topic");
        qs.set("page", "1");
        router.push(`/books?${qs.toString()}`);
      }}
      className="h-10 rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10"
    >
      <option value="">{loading ? "Loading topics…" : "All topics"}</option>
      {options.slice(1).map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
