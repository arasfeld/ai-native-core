"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";
import { CopyIcon, TrashIcon } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

type Org = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  invite_link_enabled: boolean;
  role: string;
};

type Member = {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
};

type InviteLink = {
  enabled: boolean;
  token: string | null;
};

export function OrganizationTab() {
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteLink, setInviteLink] = useState<InviteLink | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const load = useCallback(async function load() {
    const [orgRes, membersRes, invitesRes, linkRes] = await Promise.all([
      fetch("/api/organizations/current"),
      fetch("/api/organizations/current/members"),
      fetch("/api/organizations/current/invites"),
      fetch("/api/organizations/current/invite-link"),
    ]);
    if (orgRes.ok) {
      const data: Org = await orgRes.json();
      setOrg(data);
      setName(data.name);
      setSlug(data.slug ?? "");
      setLogoUrl(data.logo_url ?? "");
    }
    if (membersRes.ok) setMembers(await membersRes.json());
    if (invitesRes.ok) setInvites(await invitesRes.json());
    if (linkRes.ok) setInviteLink(await linkRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isAdmin = org?.role === "admin" || org?.role === "owner";
  const isOwner = org?.role === "owner";

  async function saveGeneral() {
    setSaving(true);
    const res = await fetch("/api/organizations/current", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        slug: slug || null,
        logo_url: logoUrl || null,
      }),
    });
    if (res.ok) setOrg(await res.json());
    setSaving(false);
  }

  async function changeRole(userId: string, role: string) {
    await fetch(`/api/organizations/current/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await load();
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member from the organization?")) return;
    await fetch(`/api/organizations/current/members/${userId}`, {
      method: "DELETE",
    });
    await load();
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;
    await fetch("/api/organizations/current/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    setInviteEmail("");
    await load();
  }

  async function revokeInvite(id: string) {
    await fetch(`/api/organizations/current/invites/${id}`, {
      method: "DELETE",
    });
    await load();
  }

  async function toggleInviteLink(enabled: boolean) {
    const res = await fetch("/api/organizations/current/invite-link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) setInviteLink(await res.json());
  }

  async function resetInviteLink() {
    if (!confirm("Reset the invite link? The current link will stop working."))
      return;
    const res = await fetch("/api/organizations/current/invite-link/reset", {
      method: "POST",
    });
    if (res.ok) setInviteLink(await res.json());
  }

  const inviteLinkUrl = inviteLink?.token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${inviteLink.token}`
    : "";

  if (!org)
    return <div className="text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="space-y-8">
      {/* General */}
      {isAdmin && (
        <section className="space-y-4">
          <h2 className="font-semibold text-base">General</h2>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-org"
              />
              {slug && (
                <p className="text-muted-foreground text-xs">
                  URL:{" "}
                  {typeof window !== "undefined" ? window.location.origin : ""}
                  /org/{slug}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-logo">Logo URL</Label>
              <div className="flex gap-2">
                <Input
                  id="org-logo"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…"
                />
                {logoUrl && (
                  <Image
                    src={logoUrl}
                    alt="logo preview"
                    width={40}
                    height={40}
                    className="size-10 rounded object-cover"
                    unoptimized
                  />
                )}
              </div>
            </div>
            <Button onClick={saveGeneral} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </section>
      )}

      {/* Members */}
      <section className="space-y-3">
        <h2 className="font-semibold text-base">Members</h2>
        <div className="divide-y rounded-md border">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-muted font-medium text-sm">
                {(m.name ?? m.email)[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">
                  {m.name ?? m.email}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {m.email}
                </p>
              </div>
              {isOwner ? (
                <Select
                  value={m.role}
                  onValueChange={(v) => changeRole(m.user_id, v)}
                >
                  <SelectTrigger className="h-7 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">member</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="owner">owner</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                  {m.role}
                </span>
              )}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => removeMember(m.user_id)}
                >
                  <TrashIcon className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Invitations */}
      {isAdmin && (
        <section className="space-y-4">
          <h2 className="font-semibold text-base">Invitations</h2>

          <form onSubmit={sendInvite} className="flex gap-2">
            <Input
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1"
            />
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">member</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!inviteEmail}>
              Send Invite
            </Button>
          </form>

          {invites.length > 0 && (
            <div className="divide-y rounded-md border">
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 px-3 py-2">
                  <p className="flex-1 text-sm">{inv.email}</p>
                  <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                    {inv.role}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    expires {new Date(inv.expires_at).toLocaleDateString()}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => revokeInvite(inv.id)}
                  >
                    <TrashIcon className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {inviteLink && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label>Invite link</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {inviteLink.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <Switch
                    checked={inviteLink.enabled}
                    onCheckedChange={toggleInviteLink}
                  />
                </div>
              </div>
              {inviteLink.enabled && inviteLinkUrl && (
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={inviteLinkUrl}
                    className="flex-1 text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigator.clipboard.writeText(inviteLinkUrl)}
                  >
                    <CopyIcon className="size-3.5" />
                  </Button>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={resetInviteLink}>
                Reset link
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
