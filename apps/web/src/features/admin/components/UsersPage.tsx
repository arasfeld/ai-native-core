"use client";

import { DataGrid } from "@repo/ui/components/data-grid";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserDetailModal } from "./UserDetailModal";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
  banned: boolean;
  plan: string | null;
  token_limit: number | null;
  tokens_used: number;
  created_at: string;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const COLUMN_DEFS: ColDef<AdminUser>[] = [
  { field: "email", headerName: "Email", flex: 1, minWidth: 200 },
  { field: "name", headerName: "Name", width: 140 },
  {
    field: "plan",
    headerName: "Plan",
    width: 90,
    cellRenderer: (p: ICellRendererParams<AdminUser>) => {
      const plan = p.data?.plan;
      if (!plan) return <span className="text-muted-foreground">—</span>;
      return (
        <span
          className={`rounded-full px-2 py-0.5 font-medium text-xs ${
            plan === "pro"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {plan}
        </span>
      );
    },
  },
  {
    colId: "usage",
    headerName: "Usage",
    width: 140,
    cellRenderer: (p: ICellRendererParams<AdminUser>) => {
      const u = p.data;
      if (!u) return null;
      const pct = u.token_limit
        ? Math.min((u.tokens_used / u.token_limit) * 100, 100)
        : 0;
      return (
        <div className="space-y-0.5 py-1">
          <p className="text-xs">
            {fmt(u.tokens_used)} / {u.token_limit ? fmt(u.token_limit) : "—"}
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
    field: "is_admin",
    headerName: "Admin",
    width: 70,
    cellRenderer: (p: ICellRendererParams<AdminUser>) =>
      p.data?.is_admin ? (
        <span className="font-medium text-primary text-xs">✓</span>
      ) : null,
  },
  {
    field: "banned",
    headerName: "Status",
    width: 90,
    cellRenderer: (p: ICellRendererParams<AdminUser>) => (
      <span
        className={`rounded-full px-2 py-0.5 font-medium text-xs ${
          p.data?.banned
            ? "bg-destructive/10 text-destructive"
            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        }`}
      >
        {p.data?.banned ? "banned" : "active"}
      </span>
    ),
  },
  {
    field: "created_at",
    headerName: "Joined",
    width: 110,
    cellRenderer: (p: ICellRendererParams<AdminUser>) =>
      p.data ? new Date(p.data.created_at).toLocaleDateString() : null,
  },
];

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback((q: string) => {
    setLoading(true);
    const qs = q ? `?search=${encodeURIComponent(q)}` : "";
    fetch(`/api/admin/users${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: AdminUser[]) => setUsers(data))
      .catch(() => setError("Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchUsers("");
  }, [fetchUsers]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchUsers(q), 300);
  }

  function handleUpdated(updated: AdminUser) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setSelected(updated);
  }

  function handleDeleted(id: string) {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setSelected(null);
  }

  return (
    <div className="space-y-4 p-8">
      <div>
        <h1 className="font-semibold text-2xl">Users</h1>
        <p className="text-muted-foreground text-sm">Manage user accounts</p>
      </div>

      <input
        type="search"
        value={search}
        onChange={handleSearchChange}
        placeholder="Search by email or name…"
        className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      {error && <p className="text-destructive text-sm">{error}</p>}

      <DataGrid<AdminUser>
        rowData={loading ? null : users}
        columnDefs={COLUMN_DEFS}
        height={520}
        loading={loading}
        getRowId={(p) => p.data.id}
        onRowClicked={(e) => {
          if (e.data) setSelected(e.data);
        }}
        overlayNoRowsTemplate="No users found."
        defaultColDef={{ sortable: true, resizable: true }}
      />

      <UserDetailModal
        user={selected}
        onClose={() => setSelected(null)}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
