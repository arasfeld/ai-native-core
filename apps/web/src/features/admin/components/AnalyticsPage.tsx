"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Analytics = {
  kpis: {
    total_users: number;
    pro_subscribers: number;
    mrr_usd: number;
    dau: number;
    tokens_today: number;
    tokens_this_month: number;
  };
  signups_per_day: { day: string; count: number }[];
  tokens_per_day: { day: string; tokens: number }[];
  dau_per_day: { day: string; users: number }[];
};

const RANGES = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "180d", value: 180 },
] as const;

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function fillGaps<T extends Record<string, unknown>>(
  rows: (T & { day: string })[],
  days: number,
  zero: Omit<T, "day">,
): (T & { day: string })[] {
  const map = new Map(rows.map((r) => [r.day, r]));
  const result: (T & { day: string })[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const existing = map.get(key);
    result.push(existing ?? ({ day: key, ...zero } as T & { day: string }));
  }
  return result;
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-2 font-semibold text-3xl">{value}</p>
      {hint && <p className="mt-1 text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4">
        <h2 className="font-semibold text-base">{title}</h2>
        {subtitle && (
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        )}
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  fontSize: "0.75rem",
  color: "var(--popover-foreground)",
};

export function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/analytics?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Analytics) => {
        setData(d);
        setError("");
      })
      .catch(() => setError("Failed to load analytics."))
      .finally(() => setLoading(false));
  }, [days]);

  const signups = useMemo(
    () =>
      fillGaps(data?.signups_per_day ?? [], days, { count: 0 }).map((r) => ({
        ...r,
        day: r.day.slice(5),
      })),
    [data, days],
  );

  const tokens = useMemo(
    () =>
      fillGaps(data?.tokens_per_day ?? [], days, { tokens: 0 }).map((r) => ({
        ...r,
        day: r.day.slice(5),
      })),
    [data, days],
  );

  const dau = useMemo(
    () =>
      fillGaps(data?.dau_per_day ?? [], days, { users: 0 }).map((r) => ({
        ...r,
        day: r.day.slice(5),
      })),
    [data, days],
  );

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl">Analytics</h1>
          <p className="text-muted-foreground text-sm">
            Product-wide growth and usage metrics
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

      {loading && !data ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Total users"
              value={fmt(data.kpis.total_users)}
              hint="All-time signups"
            />
            <KpiCard
              label="Pro subscribers"
              value={fmt(data.kpis.pro_subscribers)}
              hint="Active Stripe subscriptions"
            />
            <KpiCard
              label="MRR"
              value={data.kpis.mrr_usd > 0 ? fmtUsd(data.kpis.mrr_usd) : "—"}
              hint={
                data.kpis.mrr_usd > 0
                  ? "Estimated from Pro subs"
                  : "Set PRO_PLAN_MONTHLY_USD"
              }
            />
            <KpiCard
              label="DAU"
              value={fmt(data.kpis.dau)}
              hint="Active registered users today"
            />
            <KpiCard label="Tokens today" value={fmt(data.kpis.tokens_today)} />
            <KpiCard
              label="Tokens this month"
              value={fmt(data.kpis.tokens_this_month)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Signups per day" subtitle={`Last ${days} days`}>
              <AreaChart data={signups}>
                <defs>
                  <linearGradient id="signups" x1="0" y1="0" x2="0" y2="1">
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
                  allowDecimals={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#signups)"
                />
              </AreaChart>
            </ChartCard>

            <ChartCard
              title="Daily active users"
              subtitle="Distinct registered users per day"
            >
              <LineChart data={dau}>
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
                  allowDecimals={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="users"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartCard>

            <ChartCard
              title="Token usage per day"
              subtitle="All sessions combined"
            >
              <AreaChart data={tokens}>
                <defs>
                  <linearGradient id="tokens" x1="0" y1="0" x2="0" y2="1">
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
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => fmt(Number(v))}
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#tokens)"
                />
              </AreaChart>
            </ChartCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
