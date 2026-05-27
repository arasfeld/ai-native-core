"use client";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
};

type CreatedKey = {
  key: string;
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
};

export function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogStep, setDialogStep] = useState<"closed" | "form" | "reveal">(
    "closed",
  );
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [creating, setCreating] = useState(false);

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/user/api-keys");
    if (res.ok) setKeys(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/user/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newKeyName.trim() }),
    });
    if (res.ok) {
      const data: CreatedKey = await res.json();
      setCreatedKey(data);
      setDialogStep("reveal");
      setKeys((prev) => [
        {
          id: data.id,
          name: data.name,
          key_prefix: data.key_prefix,
          created_at: data.created_at,
          last_used_at: null,
        },
        ...prev,
      ]);
    }
    setCreating(false);
  }

  function closeDialog() {
    setDialogStep("closed");
    setNewKeyName("");
    setCreatedKey(null);
  }

  async function handleRevoke() {
    if (!revokeId) return;
    setRevoking(true);
    const res = await fetch(`/api/user/api-keys/${revokeId}`, {
      method: "DELETE",
    });
    if (res.ok || res.status === 204) {
      setKeys((prev) => prev.filter((k) => k.id !== revokeId));
    }
    setRevoking(false);
    setRevokeId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-lg">API Keys</h2>
          <p className="text-muted-foreground text-sm">
            Use API keys to authenticate programmatic requests.{" "}
            <Link
              href="/api-reference"
              className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              View API reference
              <ExternalLink className="size-3" />
            </Link>
          </p>
        </div>
        <Button onClick={() => setDialogStep("form")}>Generate new key</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : keys.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No API keys yet. Generate your first key to use the API
            programmatically.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Last used</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">
                    {k.key_prefix}…
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {k.last_used_at
                      ? new Date(k.last_used_at).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-destructive text-sm hover:underline"
                      onClick={() => setRevokeId(k.id)}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Generate key dialog */}
      <Dialog
        open={dialogStep !== "closed"}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          {dialogStep === "form" && (
            <>
              <DialogHeader>
                <DialogTitle>Generate API key</DialogTitle>
                <DialogDescription>
                  Give this key a name to identify it later.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <Input
                  placeholder="e.g. My script"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={creating || !newKeyName.trim()}
                  >
                    {creating ? "Generating…" : "Generate"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
          {dialogStep === "reveal" && createdKey && (
            <>
              <DialogHeader>
                <DialogTitle>Your new API key</DialogTitle>
                <DialogDescription>
                  Copy this key now — it won't be shown again.
                </DialogDescription>
              </DialogHeader>
              <div className="select-all break-all rounded-md bg-muted px-3 py-2 font-mono text-sm">
                {createdKey.key}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(createdKey.key)}
                >
                  Copy
                </Button>
                <Button type="button" onClick={closeDialog}>
                  I've copied this key
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation dialog */}
      <Dialog
        open={revokeId !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API key</DialogTitle>
            <DialogDescription>
              This key will stop working immediately. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokeId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoking}
            >
              {revoking ? "Revoking…" : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
