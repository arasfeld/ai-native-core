"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type PlanInfo = {
  plan: string;
  token_limit: number;
  tokens_used_this_month: number;
  tokens_remaining: number;
};

function formatNumber(n: number) {
  if (n < 0) return "Unlimited";
  return n.toLocaleString();
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  if (limit <= 0) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const color =
    pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-yellow-500" : "bg-primary";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-muted-foreground text-sm">
        <span>{formatNumber(used)} used</span>
        <span>{formatNumber(limit)} limit</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {pct}% of monthly budget used
      </p>
    </div>
  );
}

export default function BillingPage() {
  const _router = useRouter();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/billing/plan")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setPlan)
      .catch(() => setError("Failed to load billing info."))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Failed to start checkout. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePortal() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Failed to open billing portal. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Billing</h1>
          <p className="text-muted-foreground text-sm">
            Manage your plan and usage
          </p>
        </div>
        <Link
          href="/"
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          ← Back to chat
        </Link>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      {plan && (
        <div className="space-y-6 rounded-xl border p-6">
          {/* Plan badge */}
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 font-semibold text-xs uppercase tracking-wide ${
                plan.plan === "pro"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {plan.plan}
            </span>
            <span className="text-muted-foreground text-sm">
              {plan.plan === "pro"
                ? "2,000,000 tokens/month"
                : "100,000 tokens/month"}
            </span>
          </div>

          {/* Usage bar */}
          <UsageBar
            used={plan.tokens_used_this_month}
            limit={plan.token_limit}
          />

          {/* CTA */}
          <div className="flex gap-3">
            {plan.plan === "free" ? (
              <button
                type="button"
                onClick={handleUpgrade}
                disabled={actionLoading}
                className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {actionLoading ? "Redirecting…" : "Upgrade to Pro"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePortal}
                disabled={actionLoading}
                className="rounded-md border px-4 py-2 font-medium text-sm hover:bg-muted disabled:opacity-50"
              >
                {actionLoading ? "Redirecting…" : "Manage subscription"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Plan comparison */}
      <div className="grid grid-cols-2 gap-4">
        {[
          {
            name: "Free",
            tokens: "100,000",
            price: "$0/mo",
            features: ["1 user", "100k tokens/month", "Community support"],
          },
          {
            name: "Pro",
            tokens: "2,000,000",
            price: "$20/mo",
            features: [
              "1 user",
              "2M tokens/month",
              "Priority support",
              "Longer memory",
            ],
          },
        ].map((tier) => (
          <div
            key={tier.name}
            className={`space-y-3 rounded-xl border p-5 ${
              plan?.plan === tier.name.toLowerCase() ? "border-primary" : ""
            }`}
          >
            <div>
              <h3 className="font-semibold">{tier.name}</h3>
              <p className="font-bold text-2xl">{tier.price}</p>
            </div>
            <ul className="space-y-1">
              {tier.features.map((f) => (
                <li key={f} className="text-muted-foreground text-sm">
                  ✓ {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
