"use client";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

type SessionItem = {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
};

export function ProfileTab() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name ?? "");
      setImage(session.user.image ?? "");
    }
  }, [session]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess(false);
    setSaving(true);
    const { error } = await authClient.updateUser({
      name: name.trim() || undefined,
      image: image.trim() || undefined,
    });
    setSaving(false);
    if (error) {
      setSaveError(error.message ?? "Failed to save changes.");
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  }

  async function loadSessions() {
    setLoadingSessions(true);
    const { data } = await authClient.listSessions();
    setSessions((data as unknown as SessionItem[]) ?? []);
    setLoadingSessions(false);
    setSessionsLoaded(true);
  }

  async function handleRevokeSession(token: string) {
    await authClient.revokeSession({ token });
    setSessions((prev) => prev.filter((s) => s.token !== token));
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "delete my account") return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE" });
      if (!res.ok) throw new Error("Request failed");
      await authClient.signOut();
      router.push("/");
    } catch {
      setDeleteError("Failed to delete account. Please try again.");
      setDeleting(false);
    }
  }

  if (isPending) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (!session?.user) return null;

  const email = session.user.email ?? "";
  const initials = (session.user.name ?? email.split("@")[0] ?? "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Avatar + identity */}
      <div className="flex items-center gap-4">
        {session.user.image ? (
          // Avatar comes from arbitrary OAuth providers; next/image would
          // require maintaining a remotePatterns allowlist for every host.
          // biome-ignore lint/performance/noImgElement: external avatar host
          <img
            src={session.user.image}
            alt="Avatar"
            className="size-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-full bg-primary font-semibold text-lg text-primary-foreground">
            {initials}
          </div>
        )}
        <div>
          <p className="font-medium">{session.user.name ?? email}</p>
          <p className="text-muted-foreground text-sm">{email}</p>
        </div>
      </div>

      {/* Edit profile */}
      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="profile-name" className="font-medium text-sm">
                Display name
              </label>
              <Input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="profile-image" className="font-medium text-sm">
                Avatar URL
              </label>
              <Input
                id="profile-image"
                type="url"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
              />
            </div>
            {saveError && (
              <p className="text-destructive text-sm">{saveError}</p>
            )}
            {saveSuccess && (
              <p className="text-green-600 text-sm">Changes saved.</p>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Active sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Active sessions</CardTitle>
            {!sessionsLoaded && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadSessions}
                disabled={loadingSessions}
              >
                {loadingSessions ? "Loading…" : "Load sessions"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sessionsLoaded && sessions.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No other active sessions.
            </p>
          )}
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between gap-4 rounded-md border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium text-sm">
                    {s.userAgent ? s.userAgent.slice(0, 60) : "Unknown device"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    IP: {s.ipAddress ?? "unknown"} · Created:{" "}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRevokeSession(s.token)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delete account */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Delete account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            This permanently deletes your account, all conversations, and
            cancels any active subscription. This action cannot be undone.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowDeleteDialog(false);
            setDeleteConfirmText("");
            setDeleteError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              Type <strong>delete my account</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="delete my account"
          />
          {deleteError && (
            <p className="text-destructive text-sm">{deleteError}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== "delete my account" || deleting}
            >
              {deleting ? "Deleting…" : "Confirm deletion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
