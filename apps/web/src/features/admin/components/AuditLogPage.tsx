"use client";

import { DataGrid } from "@repo/ui/components/data-grid";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { useCallback, useEffect, useRef, useState } from "react";

type AuditLogEntry = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
};

type AuditLogPageResponse = {
  entries: AuditLogEntry[];
  total: number;
};

const PAGE_SIZE = 50;

const COLUMN_DEFS: ColDef<AuditLogEntry>[] = [
  {
    field: "created_at",
    headerName: "Time",
    width: 170,
    cellRenderer: (p: ICellRendererParams<AuditLogEntry>) =>
      p.data ? new Date(p.data.created_at).toLocaleString() : null,
  },
  {
    field: "actor_email",
    headerName: "Actor",
    width: 200,
    cellRenderer: (p: ICellRendererParams<AuditLogEntry>) =>
      p.data?.actor_email ?? <span className="text-muted-foreground">—</span>,
  },
  {
    field: "action",
    headerName: "Action",
    width: 180,
    cellRenderer: (p: ICellRendererParams<AuditLogEntry>) =>
      p.data ? (
        <code className="font-mono text-xs">{p.data.action}</code>
      ) : null,
  },
  {
    colId: "resource",
    headerName: "Resource",
    flex: 1,
    minWidth: 200,
    cellRenderer: (p: ICellRendererParams<AuditLogEntry>) => {
      const d = p.data;
      if (!d) return null;
      return (
        <span className="text-muted-foreground">
          {d.resource_type}
          {d.resource_id ? `:${d.resource_id}` : ""}
        </span>
      );
    },
  },
  {
    field: "ip_address",
    headerName: "IP",
    width: 130,
    cellRenderer: (p: ICellRendererParams<AuditLogEntry>) =>
      p.data?.ip_address ?? <span className="text-muted-foreground">—</span>,
  },
];

function MetadataModal({
  entry,
  onClose,
}: {
  entry: AuditLogEntry | null;
  onClose: () => void;
}) {
  if (!entry) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <div
        className="w-full max-w-xl space-y-4 rounded-lg border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        <div>
          <h2 className="font-semibold text-lg">Audit event</h2>
          <p className="font-mono text-muted-foreground text-xs">{entry.id}</p>
        </div>
        <dl className="grid grid-cols-[100px_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">Time</dt>
          <dd>{new Date(entry.created_at).toLocaleString()}</dd>
          <dt className="text-muted-foreground">Actor</dt>
          <dd>{entry.actor_email ?? entry.actor_id ?? "—"}</dd>
          <dt className="text-muted-foreground">Action</dt>
          <dd className="font-mono text-xs">{entry.action}</dd>
          <dt className="text-muted-foreground">Resource</dt>
          <dd>
            {entry.resource_type}
            {entry.resource_id ? `:${entry.resource_id}` : ""}
          </dd>
          <dt className="text-muted-foreground">IP</dt>
          <dd>{entry.ip_address ?? "—"}</dd>
        </dl>
        <div>
          <p className="mb-1 text-muted-foreground text-xs uppercase tracking-wide">
            Metadata
          </p>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);

  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [offset, setOffset] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/admin/audit-logs/resource-types")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: string[]) => setResourceTypes(data))
      .catch(() => {});
  }, []);

  const fetchEntries = useCallback(
    (params: {
      actor: string;
      action: string;
      resourceType: string;
      since: string;
      until: string;
      offset: number;
    }) => {
      setLoading(true);
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String(params.offset));
      if (params.actor) qs.set("actor", params.actor);
      if (params.action) qs.set("action", params.action);
      if (params.resourceType) qs.set("resource_type", params.resourceType);
      if (params.since) qs.set("since", new Date(params.since).toISOString());
      if (params.until) qs.set("until", new Date(params.until).toISOString());

      fetch(`/api/admin/audit-logs?${qs.toString()}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data: AuditLogPageResponse) => {
          setEntries(data.entries);
          setTotal(data.total);
          setError("");
        })
        .catch(() => setError("Failed to load audit log."))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchEntries({ actor, action, resourceType, since, until, offset });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [actor, action, resourceType, since, until, offset, fetchEntries]);

  function resetPage<T>(setter: (v: T) => void): (v: T) => void {
    return (v) => {
      setter(v);
      setOffset(0);
    };
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4 p-8">
      <div>
        <h1 className="font-semibold text-2xl">Audit Log</h1>
        <p className="text-muted-foreground text-sm">
          Browse administrative and account events
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input
          type="search"
          value={actor}
          onChange={(e) => resetPage(setActor)(e.target.value)}
          placeholder="Actor email…"
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="search"
          value={action}
          onChange={(e) => resetPage(setAction)(e.target.value)}
          placeholder="Action (e.g. user.banned)…"
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={resourceType}
          onChange={(e) => resetPage(setResourceType)(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All resource types</option>
          {resourceTypes.map((rt) => (
            <option key={rt} value={rt}>
              {rt}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={since}
          onChange={(e) => resetPage(setSince)(e.target.value)}
          aria-label="Since"
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="datetime-local"
          value={until}
          onChange={(e) => resetPage(setUntil)(e.target.value)}
          aria-label="Until"
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <DataGrid<AuditLogEntry>
        rowData={loading ? null : entries}
        columnDefs={COLUMN_DEFS}
        height={520}
        loading={loading}
        getRowId={(p) => p.data.id}
        onRowClicked={(e) => {
          if (e.data) setSelected(e.data);
        }}
        overlayNoRowsTemplate="No audit events match these filters."
        defaultColDef={{ sortable: false, resizable: true }}
        pagination={false}
      />

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {total === 0
            ? "0 events"
            : `Showing ${offset + 1}–${Math.min(offset + entries.length, total)} of ${total}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="rounded-md border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            ← Prev
          </button>
          <span className="text-muted-foreground text-xs">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="rounded-md border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>

      <MetadataModal entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
