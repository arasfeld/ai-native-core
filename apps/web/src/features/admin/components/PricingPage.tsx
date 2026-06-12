"use client";

import { Button } from "@repo/ui/components/button";
import { DataGrid } from "@repo/ui/components/data-grid";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { useEffect, useState } from "react";

type ModelPricing = {
  provider: string;
  model: string;
  input_usd_per_mtok: string;
  output_usd_per_mtok: string;
  is_override: boolean;
  updated_at: string | null;
};

function fmtUsd(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return `$${n.toFixed(n >= 1 ? 2 : 4)}`;
}

function EditModal({
  row,
  onClose,
  onSaved,
  onDeleted,
}: {
  row: ModelPricing | null;
  onClose: () => void;
  onSaved: (r: ModelPricing) => void;
  onDeleted: (provider: string, model: string) => void;
}) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (row) {
      setInput(row.input_usd_per_mtok);
      setOutput(row.output_usd_per_mtok);
      setError("");
    }
  }, [row]);

  if (!row) return null;

  async function handleSave() {
    if (!row) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/pricing/${row.provider}/${encodeURIComponent(row.model)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            input_usd_per_mtok: input,
            output_usd_per_mtok: output,
          }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const saved: ModelPricing = await res.json();
      onSaved(saved);
      onClose();
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevert() {
    if (!row) return;
    if (!confirm(`Delete the pricing row for ${row.provider}/${row.model}?`)) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/pricing/${row.provider}/${encodeURIComponent(row.model)}`,
        { method: "DELETE" },
      );
      if (!res.ok && res.status !== 204) throw new Error(await res.text());
      onDeleted(row.provider, row.model);
      onClose();
    } catch {
      setError("Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!row}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            {row.provider} / {row.model}
          </DialogTitle>
          <p className="text-muted-foreground text-xs">
            Rates in USD per 1M tokens. Saving marks the row as an override.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="input-rate"
              className="text-muted-foreground text-xs"
            >
              Input USD / 1M tokens
            </label>
            <input
              id="input-rate"
              type="number"
              step="0.000001"
              min="0"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="output-rate"
              className="text-muted-foreground text-xs"
            >
              Output USD / 1M tokens
            </label>
            <input
              id="output-rate"
              type="number"
              step="0.000001"
              min="0"
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {error && <p className="text-destructive text-xs">{error}</p>}

        <div className="flex justify-between gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={handleRevert}
          >
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const COLUMN_DEFS: ColDef<ModelPricing>[] = [
  { field: "provider", headerName: "Provider", width: 130, sort: "asc" },
  { field: "model", headerName: "Model", flex: 1, minWidth: 220 },
  {
    field: "input_usd_per_mtok",
    headerName: "Input $ / 1M",
    width: 130,
    cellRenderer: (p: ICellRendererParams<ModelPricing>) =>
      p.data ? fmtUsd(p.data.input_usd_per_mtok) : null,
  },
  {
    field: "output_usd_per_mtok",
    headerName: "Output $ / 1M",
    width: 140,
    cellRenderer: (p: ICellRendererParams<ModelPricing>) =>
      p.data ? fmtUsd(p.data.output_usd_per_mtok) : null,
  },
  {
    field: "is_override",
    headerName: "Source",
    width: 120,
    cellRenderer: (p: ICellRendererParams<ModelPricing>) => {
      if (!p.data) return null;
      return p.data.is_override ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700 text-xs dark:bg-amber-900/30 dark:text-amber-400">
          override
        </span>
      ) : (
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
          default
        </span>
      );
    },
  },
  {
    field: "updated_at",
    headerName: "Updated",
    width: 120,
    cellRenderer: (p: ICellRendererParams<ModelPricing>) =>
      p.data?.updated_at
        ? new Date(p.data.updated_at).toLocaleDateString()
        : "—",
  },
];

export function PricingPage() {
  const [rows, setRows] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ModelPricing | null>(null);

  useEffect(() => {
    fetch("/api/admin/pricing")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: ModelPricing[]) => setRows(data))
      .catch(() => setError("Failed to load pricing."))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(updated: ModelPricing) {
    setRows((prev) => {
      const idx = prev.findIndex(
        (r) => r.provider === updated.provider && r.model === updated.model,
      );
      if (idx === -1) return [...prev, updated];
      const next = prev.slice();
      next[idx] = updated;
      return next;
    });
  }

  function handleDeleted(provider: string, model: string) {
    setRows((prev) =>
      prev.filter((r) => !(r.provider === provider && r.model === model)),
    );
  }

  return (
    <div className="space-y-4 p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Model Pricing</h1>
          <p className="text-muted-foreground text-sm">
            Per-model USD rates used to convert token usage into dollar spend
          </p>
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <DataGrid<ModelPricing>
        rowData={loading ? null : rows}
        columnDefs={COLUMN_DEFS}
        height={520}
        loading={loading}
        getRowId={(p) => `${p.data.provider}/${p.data.model}`}
        onRowClicked={(e) => {
          if (e.data) setSelected(e.data);
        }}
        overlayNoRowsTemplate="No pricing rows."
        defaultColDef={{ sortable: true, resizable: true }}
      />

      <EditModal
        row={selected}
        onClose={() => setSelected(null)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
