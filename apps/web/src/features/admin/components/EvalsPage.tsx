"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

interface EvalSummary {
  category: string;
  scorer: string;
  latest_score: number;
  threshold: number | null;
  pass_count: number;
  total_count: number;
  latest_at: string;
  commit_sha: string;
  branch: string | null;
  langsmith_run_url: string | null;
}

interface EvalRun {
  id: string;
  commit_sha: string;
  branch: string | null;
  category: string;
  scorer: string;
  pass_count: number;
  total_count: number;
  score: number;
  threshold: number | null;
  langsmith_run_url: string | null;
  created_at: string;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function shortSha(sha: string): string {
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}

function statusColor(score: number, threshold: number | null): string {
  if (threshold === null) return "text-muted-foreground";
  return score >= threshold ? "text-emerald-600" : "text-destructive";
}

function Sparkline({ data }: { data: EvalRun[] }) {
  if (data.length < 2) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const chartData = data.map((r) => ({ x: r.created_at, score: r.score }));
  return (
    <div className="h-8 w-32">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <YAxis domain={[0, 1]} hide />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
              fontSize: "0.75rem",
            }}
            formatter={(v) => pct(Number(v))}
            labelFormatter={(_, payload) => {
              const item = payload?.[0]?.payload as { x: string } | undefined;
              return item?.x ? new Date(item.x).toLocaleDateString() : "";
            }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EvalsPage() {
  const [latest, setLatest] = useState<EvalSummary[] | null>(null);
  const [historyByKey, setHistoryByKey] = useState<Record<string, EvalRun[]>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/evals/latest").then((r) =>
        r.ok ? r.json() : Promise.reject(r.status),
      ),
      fetch("/api/admin/evals/history?days=60").then((r) =>
        r.ok ? r.json() : Promise.reject(r.status),
      ),
    ])
      .then(([summaries, history]: [EvalSummary[], EvalRun[]]) => {
        setLatest(summaries);
        const byKey: Record<string, EvalRun[]> = {};
        for (const row of history) {
          const key = `${row.category}__${row.scorer}`;
          if (!byKey[key]) byKey[key] = [];
          byKey[key].push(row);
        }
        setHistoryByKey(byKey);
        setError("");
      })
      .catch(() => setError("Failed to load eval data."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="font-semibold text-2xl">Evals</h1>
        <p className="text-muted-foreground text-sm">
          Most-recent eval pass rates per category and scorer, written by the CI
          eval workflow.
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {loading && !latest ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : latest && latest.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="font-medium text-sm">No eval runs recorded yet.</p>
          <p className="mt-1 text-muted-foreground text-xs">
            The eval workflow writes here when it runs against{" "}
            <code className="rounded bg-muted px-1">main</code> with{" "}
            <code className="rounded bg-muted px-1">EVAL_DB_URL</code> set.
          </p>
        </div>
      ) : latest ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr className="text-left text-muted-foreground text-xs uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Scorer</th>
                <th className="px-4 py-3 text-right font-medium">Score</th>
                <th className="px-4 py-3 text-right font-medium">Threshold</th>
                <th className="px-4 py-3 text-right font-medium">Passing</th>
                <th className="px-4 py-3 font-medium">60d trend</th>
                <th className="px-4 py-3 font-medium">Last run</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {latest.map((s) => {
                const key = `${s.category}__${s.scorer}`;
                const history = historyByKey[key] ?? [];
                return (
                  <tr
                    key={key}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">{s.category}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.scorer}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-semibold ${statusColor(
                        s.latest_score,
                        s.threshold,
                      )}`}
                    >
                      {pct(s.latest_score)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {s.threshold !== null ? pct(s.threshold) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {s.pass_count}/{s.total_count}
                    </td>
                    <td className="px-4 py-3">
                      <Sparkline data={history} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      <div>
                        {new Date(s.latest_at).toLocaleDateString()}{" "}
                        <span className="font-mono">
                          {shortSha(s.commit_sha)}
                        </span>
                      </div>
                      {s.branch && <div className="text-xs">{s.branch}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {s.langsmith_run_url && (
                        <a
                          href={s.langsmith_run_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Open in LangSmith"
                        >
                          <ExternalLinkIcon className="size-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
