"use client";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { useState } from "react";

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

export function UserDetailModal({
  user,
  onClose,
  onUpdated,
  onDeleted,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onUpdated: (u: AdminUser) => void;
  onDeleted: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  if (!user) return null;

  async function handleBanToggle() {
    if (!user) return;
    setLoading("ban");
    setError("");
    try {
      const action = user.banned ? "unban" : "ban";
      const res = await fetch(`/api/admin/users/${user.id}/${action}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      onUpdated({ ...user, banned: !user.banned });
    } catch {
      setError("Action failed.");
    } finally {
      setLoading(null);
    }
  }

  async function handleResetPassword() {
    if (!user) return;
    setLoading("reset");
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResetSent(true);
    } catch {
      setError("Failed to send reset email.");
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete() {
    if (!user || deleteInput !== user.email) return;
    setLoading("delete");
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error(await res.text());
      onDeleted(user.id);
      onClose();
    } catch {
      setError("Delete failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog
      open={!!user}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{user.email}</DialogTitle>
          {user.name && (
            <p className="text-muted-foreground text-sm">{user.name}</p>
          )}
        </DialogHeader>

        <div className="space-y-1 text-sm">
          <div className="flex gap-4">
            <span className="text-muted-foreground">Plan</span>
            <span>{user.plan ?? "—"}</span>
          </div>
          <div className="flex gap-4">
            <span className="text-muted-foreground">Usage</span>
            <span>
              {fmt(user.tokens_used)} /{" "}
              {user.token_limit ? fmt(user.token_limit) : "—"} tokens
            </span>
          </div>
          <div className="flex gap-4">
            <span className="text-muted-foreground">Joined</span>
            <span>{new Date(user.created_at).toLocaleDateString()}</span>
          </div>
          <div className="flex gap-4">
            <span className="text-muted-foreground">Status</span>
            <span
              className={user.banned ? "text-destructive" : "text-green-600"}
            >
              {user.banned ? "banned" : "active"}
            </span>
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={!!loading}
            onClick={handleBanToggle}
          >
            {loading === "ban" ? "…" : user.banned ? "Unban user" : "Ban user"}
          </Button>

          {resetSent ? (
            <p className="text-center text-green-600 text-sm">
              Reset email sent.
            </p>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!!loading}
              onClick={handleResetPassword}
            >
              {loading === "reset" ? "Sending…" : "Send password reset email"}
            </Button>
          )}

          {!confirmDelete ? (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => setConfirmDelete(true)}
            >
              Delete user
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border border-destructive p-3">
              <p className="text-destructive text-sm">
                Type <strong>{user.email}</strong> to confirm deletion:
              </p>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-destructive"
                placeholder={user.email}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  disabled={deleteInput !== user.email || loading === "delete"}
                  onClick={handleDelete}
                >
                  {loading === "delete" ? "Deleting…" : "Confirm delete"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setConfirmDelete(false);
                    setDeleteInput("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
