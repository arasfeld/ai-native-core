"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AIFeatureConfig = {
  feature: string;
  provider: string;
  model: string | null;
  enabled: boolean;
};

const PROVIDERS = ["ollama", "openai", "anthropic", "openrouter"] as const;

function ConfigRow({
  config,
  onSave,
}: {
  config: AIFeatureConfig;
  onSave: (updated: AIFeatureConfig) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState(config.provider);
  const [model, setModel] = useState(config.model ?? "");
  const [enabled, setEnabled] = useState(config.enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await onSave({ ...config, provider, model: model || null, enabled });
      setEditing(false);
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b last:border-b-0">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <code className="font-mono text-sm">{config.feature}</code>
          {!editing && (
            <span className="text-muted-foreground text-sm">
              {config.provider}
              {config.model ? ` / ${config.model}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!editing && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                config.enabled
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {config.enabled ? "enabled" : "disabled"}
            </span>
          )}
          {editing ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-primary px-3 py-1 text-primary-foreground text-xs disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="grid grid-cols-3 gap-3 bg-muted/30 px-4 pb-4">
          <div className="space-y-1">
            <label
              htmlFor={`provider-${config.feature}`}
              className="text-muted-foreground text-xs"
            >
              Provider
            </label>
            <select
              id={`provider-${config.feature}`}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label
              htmlFor={`model-${config.feature}`}
              className="text-muted-foreground text-xs"
            >
              Model (optional)
            </label>
            <input
              id={`model-${config.feature}`}
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. gpt-4o-mini"
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-end space-y-1 pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded"
              />
              Enabled
            </label>
          </div>
          {error && (
            <p className="col-span-3 text-destructive text-xs">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminPage() {
  const [configs, setConfigs] = useState<AIFeatureConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/ai-config")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: Record<string, AIFeatureConfig>) =>
        setConfigs(Object.values(data)),
      )
      .catch(() => setError("Failed to load config."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(updated: AIFeatureConfig) {
    const res = await fetch(`/api/admin/ai-config/${updated.feature}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: updated.provider,
        model: updated.model,
        enabled: updated.enabled,
      }),
    });
    if (!res.ok) throw new Error("Save failed");
    const saved: AIFeatureConfig = await res.json();
    setConfigs((prev) =>
      prev.map((c) => (c.feature === saved.feature ? saved : c)),
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">AI Config</h1>
          <p className="text-muted-foreground text-sm">
            Manage per-feature LLM provider and model settings
          </p>
        </div>
        <Link
          href="/chat"
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          ← Back to chat
        </Link>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      {configs.length > 0 && (
        <div className="rounded-xl border">
          {configs.map((c) => (
            <ConfigRow key={c.feature} config={c} onSave={handleSave} />
          ))}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Changes take effect immediately — no restart required. In production,
        gate this page behind an admin role check.
      </p>
    </div>
  );
}
