"use client";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { useState } from "react";

type AdminTenant = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  token_limit: number;
  tokens_used: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function TenantEditModal({
  tenant,
  onClose,
  onUpdated,
}: {
  tenant: AdminTenant | null;
  onClose: () => void;
  onUpdated: (t: AdminTenant) => void;
}) {
  const [plan, setPlan] = useState(tenant?.plan ?? "free");
  const [tokenLimit, setTokenLimit] = useState(
    String(tenant?.token_limit ?? 100000),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Sync local state when tenant changes
  if (tenant && plan !== tenant.plan && !saving) setPlan(tenant.plan);

  if (!tenant) return null;

  async function handleSave() {
    if (!tenant) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, token_limit: Number(tokenLimit) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated: AdminTenant = await res.json();
      onUpdated(updated);
      onClose();
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!tenant}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{tenant.email}</DialogTitle>
          {tenant.name && (
            <p className="text-muted-foreground text-sm">{tenant.name}</p>
          )}
        </DialogHeader>

        <div className="text-muted-foreground text-sm">
          Current usage: {fmt(tenant.tokens_used)} / {fmt(tenant.token_limit)}{" "}
          tokens
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="plan" className="text-muted-foreground text-xs">
              Plan
            </label>
            <select
              id="plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="free">free</option>
              <option value="pro">pro</option>
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="tokenLimit"
              className="text-muted-foreground text-xs"
            >
              Monthly token limit
            </label>
            <input
              id="tokenLimit"
              type="number"
              value={tokenLimit}
              onChange={(e) => setTokenLimit(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {tenant.stripe_customer_id && (
          <p className="font-mono text-muted-foreground text-xs">
            Stripe: {tenant.stripe_customer_id}
          </p>
        )}

        {error && <p className="text-destructive text-xs">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
