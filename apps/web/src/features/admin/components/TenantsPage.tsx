"use client";

import { DataGrid } from "@repo/ui/components/data-grid";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { useEffect, useState } from "react";
import { TenantEditModal } from "./TenantEditModal";

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

const COLUMN_DEFS: ColDef<AdminTenant>[] = [
  { field: "email", headerName: "Email", flex: 1, minWidth: 200 },
  { field: "name", headerName: "Name", width: 140 },
  {
    field: "plan",
    headerName: "Plan",
    width: 90,
    cellRenderer: (p: ICellRendererParams<AdminTenant>) => {
      const plan = p.data?.plan;
      return (
        <span
          className={`rounded-full px-2 py-0.5 font-medium text-xs ${
            plan === "pro"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {plan ?? "—"}
        </span>
      );
    },
  },
  {
    field: "token_limit",
    headerName: "Limit",
    width: 100,
    cellRenderer: (p: ICellRendererParams<AdminTenant>) =>
      p.data ? fmt(p.data.token_limit) : null,
  },
  {
    colId: "usage",
    headerName: "Usage",
    width: 140,
    cellRenderer: (p: ICellRendererParams<AdminTenant>) => {
      const t = p.data;
      if (!t) return null;
      const pct = Math.min((t.tokens_used / t.token_limit) * 100, 100);
      return (
        <div className="space-y-0.5 py-1">
          <p className="text-xs">
            {fmt(t.tokens_used)} / {fmt(t.token_limit)}
          </p>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    },
  },
  {
    field: "stripe_customer_id",
    headerName: "Stripe Customer",
    width: 160,
    cellRenderer: (p: ICellRendererParams<AdminTenant>) =>
      p.data?.stripe_customer_id ? (
        <span className="font-mono text-muted-foreground text-xs">
          {p.data.stripe_customer_id.slice(0, 18)}…
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    field: "created_at",
    headerName: "Created",
    width: 110,
    cellRenderer: (p: ICellRendererParams<AdminTenant>) =>
      p.data ? new Date(p.data.created_at).toLocaleDateString() : null,
  },
];

export function TenantsPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AdminTenant | null>(null);

  useEffect(() => {
    fetch("/api/admin/tenants")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: AdminTenant[]) => setTenants(data))
      .catch(() => setError("Failed to load tenants."))
      .finally(() => setLoading(false));
  }, []);

  function handleUpdated(updated: AdminTenant) {
    setTenants((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  return (
    <div className="space-y-4 p-8">
      <div>
        <h1 className="font-semibold text-2xl">Tenants</h1>
        <p className="text-muted-foreground text-sm">
          View and override plan limits
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <DataGrid<AdminTenant>
        rowData={loading ? null : tenants}
        columnDefs={COLUMN_DEFS}
        height={520}
        loading={loading}
        getRowId={(p) => p.data.id}
        onRowClicked={(e) => {
          if (e.data) setSelected(e.data);
        }}
        overlayNoRowsTemplate="No tenants found."
        defaultColDef={{ sortable: true, resizable: true }}
      />

      <TenantEditModal
        tenant={selected}
        onClose={() => setSelected(null)}
        onUpdated={handleUpdated}
      />
    </div>
  );
}
