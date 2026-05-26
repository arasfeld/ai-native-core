"use client";

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

export function ProfilePage() {
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

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (!session?.user) return null;

  const email = session.user.email ?? "";
  const initials = (session.user.name ?? email.split("@")[0] ?? "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-10">
      <h1 className="font-semibold text-2xl">Profile</h1>

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

      {/* Profile edit form */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="font-medium text-lg">Edit profile</h2>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="profile-name" className="font-medium text-sm">
              Display name
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="profile-image" className="font-medium text-sm">
              Avatar URL
            </label>
            <input
              id="profile-image"
              type="url"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {saveError && <p className="text-destructive text-sm">{saveError}</p>}
          {saveSuccess && (
            <p className="text-green-600 text-sm">Changes saved.</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>

      {/* Active sessions */}
      <section className="space-y-4 rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-lg">Active sessions</h2>
          {!sessionsLoaded && (
            <button
              type="button"
              onClick={loadSessions}
              disabled={loadingSessions}
              className="text-primary text-sm underline underline-offset-4 disabled:opacity-50"
            >
              {loadingSessions ? "Loading…" : "Load sessions"}
            </button>
          )}
        </div>
        {sessionsLoaded && sessions.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No other active sessions.
          </p>
        )}
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
            <button
              type="button"
              onClick={() => handleRevokeSession(s.token)}
              className="shrink-0 text-destructive text-sm hover:underline"
            >
              Revoke
            </button>
          </div>
        ))}
      </section>

      {/* Delete account */}
      <section className="space-y-4 rounded-lg border border-destructive/30 p-6">
        <h2 className="font-medium text-destructive text-lg">Delete account</h2>
        <p className="text-muted-foreground text-sm">
          This permanently deletes your account, all conversations, and cancels
          any active subscription. This action cannot be undone.
        </p>
        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-md border border-destructive px-4 py-2 text-destructive text-sm hover:bg-destructive hover:text-destructive-foreground"
          >
            Delete my account
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Type <strong>delete my account</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete my account"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {deleteError && (
              <p className="text-destructive text-sm">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "delete my account" || deleting}
                className="rounded-md bg-destructive px-4 py-2 font-medium text-destructive-foreground text-sm hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Confirm deletion"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                  setDeleteError("");
                }}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
