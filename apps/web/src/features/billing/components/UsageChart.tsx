"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DayTokens = { day: string; tokens: number };

type UsageSummary = {
  days: number;
  total_tokens: number;
  tokens_per_day: DayTokens[];
};

const RANGES = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
] as const;

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fillGaps(rows: DayTokens[], days: number): DayTokens[] {
  const map = new Map(rows.map((r) => [r.day, r.tokens]));
  const result: DayTokens[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ day: key, tokens: map.get(key) ?? 0 });
  }
  return result;
}

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  fontSize: "0.75rem",
  color: "var(--popover-foreground)",
};

export function UsageChart() {
  const [data, setData] = useState<UsageSummary | null>(null);
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/billing/usage?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: UsageSummary) => {
        setData(d);
        setError("");
      })
      .catch(() => setError("Failed to load usage."))
      .finally(() => setLoading(false));
  }, [days]);

  const series = useMemo(
    () =>
      fillGaps(data?.tokens_per_day ?? [], days).map((r) => ({
        ...r,
        day: r.day.slice(5),
      })),
    [data, days],
  );

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg">Usage over time</h2>
          <p className="text-muted-foreground text-sm">
            Daily token consumption across all your conversations.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setDays(r.value)}
              className={`rounded px-3 py-1 text-xs transition-colors ${
                days === r.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="rounded-xl border bg-card p-4">
        {loading && !data ? (
          <p className="px-2 py-12 text-center text-muted-foreground text-sm">
            Loading usage…
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-baseline gap-2 px-1">
              <span className="font-semibold text-2xl">
                {fmt(data?.total_tokens ?? 0)}
              </span>
              <span className="text-muted-foreground text-xs">
                tokens in the last {days} days
              </span>
            </div>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={series}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="billing-usage"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--primary)"
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--primary)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="day"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                    minTickGap={24}
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                    tickFormatter={fmt}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [fmt(Number(v)), "tokens"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#billing-usage)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
