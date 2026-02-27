"use client";

import { useEffect, useMemo, useState } from "react";

type DayRow = { day: string; visitors: number; pageviews: number };

type Stats = {
  ok: boolean;
  now: number;
  activeNow: number;
  visitorsToday: number;
  visitorsLast7Days: number;
  pageviewsToday: number;
  pageviewsLast7Days: number;
  days: DayRow[];
  error?: string;
};

function Card({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-wide text-white/60">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-white/50">{sub}</div> : null}
    </div>
  );
}

export function AdminDashboard() {
  const [token, setToken] = useState<string>("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string>("");

  const canFetch = useMemo(() => token.trim().length > 0, [token]);

  useEffect(() => {
    if (!canFetch) return;

    let alive = true;

    const pull = async () => {
      try {
        const r = await fetch(`/api/admin/stats?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const text = await r.text();
        const j = (text ? (JSON.parse(text) as Stats) : ({ ok: false, error: "Empty response" } as Stats));
        if (!alive) return;
        if (!r.ok || !j.ok) {
          setErr(j.error || `Request failed (${r.status})`);
          setStats(null);
          return;
        }
        setErr("");
        setStats(j);
      } catch (e: unknown) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : "Fetch failed";
        setErr(msg);
        setStats(null);
      }
    };

    pull();
    const t = setInterval(pull, 5000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [token, canFetch]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="text-lg font-semibold">Admin dashboard</div>
        <div className="mt-2 text-sm text-white/70">
          This dashboard tracks anonymous visitors and active sessions (last 5 minutes). It is best-effort on
          serverless/multi-instance hosting.
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
            placeholder="ADMIN_TOKEN"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <div className="text-xs text-white/50 sm:w-[260px]">
            Token is checked server-side. Keep it secret.
          </div>
        </div>
        {err ? <div className="mt-3 text-sm text-red-300">{err}</div> : null}
      </div>

      {!stats ? (
        <div className="text-sm text-white/60">Enter ADMIN_TOKEN to load stats.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card title="Active now" value={stats.activeNow} sub="Seen in last 5 minutes" />
            <Card title="Visitors today" value={stats.visitorsToday} />
            <Card title="Visitors (7d)" value={stats.visitorsLast7Days} />
            <Card title="Pageviews today" value={stats.pageviewsToday} />
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 text-sm font-semibold">Last 7 days</div>
            <div className="overflow-x-auto">
              <table className="min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-white/60">
                    <th className="py-2 pr-4">Day</th>
                    <th className="py-2 pr-4">Visitors</th>
                    <th className="py-2 pr-4">Pageviews</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.days.map((d) => (
                    <tr key={d.day} className="border-t border-white/10">
                      <td className="py-2 pr-4 font-mono text-xs">{d.day}</td>
                      <td className="py-2 pr-4">{d.visitors}</td>
                      <td className="py-2 pr-4">{d.pageviews}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
