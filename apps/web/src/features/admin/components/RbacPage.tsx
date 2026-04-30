"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type User = { id: string; email: string; name: string | null };
type UserRole = { id: string; role_id: string; org_id: string | null };
type UserPermission = {
  id: string;
  permission_id: string;
  org_id: string | null;
};
type Role = { id: string; description: string; permissions: string[] };
type Permission = { id: string; description: string };

// ── helpers ──────────────────────────────────────────────────────────────────

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api/rbac/${path}`, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

// ── Users tab ────────────────────────────────────────────────────────────────

function UserDetail({
  user,
  allRoles,
  onClose,
}: {
  user: User;
  allRoles: Role[];
  onClose: () => void;
}) {
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [roleToAdd, setRoleToAdd] = useState("");
  const [permToAdd, setPermToAdd] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<UserRole[]>(`users/${user.id}/roles`),
      api<UserPermission[]>(`users/${user.id}/permissions`),
    ])
      .then(([r, p]) => {
        setRoles(r);
        setPermissions(p);
      })
      .catch(() => setError("Failed to load user details."))
      .finally(() => setLoading(false));
  }, [user.id]);

  async function assignRole() {
    if (!roleToAdd) return;
    try {
      const r = await api<UserRole>(`users/${user.id}/roles`, {
        method: "POST",
        body: JSON.stringify({ role_id: roleToAdd }),
      });
      setRoles((prev) => [...prev, r]);
      setRoleToAdd("");
    } catch {
      setError("Failed to assign role.");
    }
  }

  async function revokeRole(roleId: string) {
    try {
      await api(`users/${user.id}/roles/${roleId}`, { method: "DELETE" });
      setRoles((prev) => prev.filter((r) => r.role_id !== roleId));
    } catch {
      setError("Failed to revoke role.");
    }
  }

  async function grantPermission() {
    if (!permToAdd) return;
    try {
      const p = await api<UserPermission>(`users/${user.id}/permissions`, {
        method: "POST",
        body: JSON.stringify({ permission_id: permToAdd }),
      });
      setPermissions((prev) => [...prev, p]);
      setPermToAdd("");
    } catch {
      setError("Failed to grant permission.");
    }
  }

  async function revokePermission(permId: string) {
    try {
      await api(`users/${user.id}/permissions/${permId}`, { method: "DELETE" });
      setPermissions((prev) => prev.filter((p) => p.permission_id !== permId));
    } catch {
      setError("Failed to revoke permission.");
    }
  }

  const assignedRoleIds = new Set(roles.map((r) => r.role_id));

  return (
    <div className="mt-4 space-y-6 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{user.email}</p>
          {user.name && (
            <p className="text-muted-foreground text-xs">{user.name}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground text-xs hover:text-foreground"
        >
          ✕ Close
        </button>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      {!loading && (
        <>
          <section className="space-y-2">
            <h3 className="font-medium text-sm">Roles</h3>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <span
                  key={r.id}
                  className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"
                >
                  {r.role_id}
                  <button
                    type="button"
                    onClick={() => revokeRole(r.role_id)}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </span>
              ))}
              {roles.length === 0 && (
                <span className="text-muted-foreground text-xs">
                  No roles assigned
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <select
                value={roleToAdd}
                onChange={(e) => setRoleToAdd(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Add role…</option>
                {allRoles
                  .filter((r) => !assignedRoleIds.has(r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={assignRole}
                disabled={!roleToAdd}
                className="rounded-md bg-primary px-3 py-1 text-primary-foreground text-xs disabled:opacity-40"
              >
                Assign
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium text-sm">Direct permissions</h3>
            <div className="flex flex-wrap gap-2">
              {permissions.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 font-mono text-xs"
                >
                  {p.permission_id}
                  <button
                    type="button"
                    onClick={() => revokePermission(p.permission_id)}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </span>
              ))}
              {permissions.length === 0 && (
                <span className="text-muted-foreground text-xs">
                  No direct permissions
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={permToAdd}
                onChange={(e) => setPermToAdd(e.target.value)}
                placeholder="e.g. billing:manage"
                className="rounded-md border bg-background px-2 py-1 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={grantPermission}
                disabled={!permToAdd}
                className="rounded-md bg-primary px-3 py-1 text-primary-foreground text-xs disabled:opacity-40"
              >
                Grant
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function UsersTab({ allRoles }: { allRoles: Role[] }) {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    setLoading(true);
    api<User[]>(`users${qs}`)
      .then(setUsers)
      .catch(() => setError("Failed to load users."))
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search users by email or name…"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      {error && <p className="text-destructive text-sm">{error}</p>}
      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {!loading && (
        <div className="rounded-xl border">
          {users.map((u) => (
            <div key={u.id} className="border-b px-4 py-3 last:border-b-0">
              <button
                type="button"
                className="w-full text-left"
                onClick={() =>
                  setSelectedUser(selectedUser?.id === u.id ? null : u)
                }
              >
                <p className="text-sm">{u.email}</p>
                {u.name && (
                  <p className="text-muted-foreground text-xs">{u.name}</p>
                )}
              </button>
              {selectedUser?.id === u.id && (
                <UserDetail
                  user={u}
                  allRoles={allRoles}
                  onClose={() => setSelectedUser(null)}
                />
              )}
            </div>
          ))}
          {users.length === 0 && (
            <p className="px-4 py-3 text-muted-foreground text-sm">
              No users found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Roles tab ────────────────────────────────────────────────────────────────

function RolesTab({
  roles,
  allPermissions,
}: {
  roles: Role[];
  allPermissions: Permission[];
}) {
  const [roleList, setRoleList] = useState(roles);
  const [permInputs, setPermInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function addPermission(roleId: string) {
    const permId = permInputs[roleId];
    if (!permId) return;
    try {
      await api(`roles/${roleId}/permissions`, {
        method: "POST",
        body: JSON.stringify({ permission_id: permId }),
      });
      setRoleList((prev) =>
        prev.map((r) =>
          r.id === roleId
            ? { ...r, permissions: [...r.permissions, permId] }
            : r,
        ),
      );
      setPermInputs((prev) => ({ ...prev, [roleId]: "" }));
    } catch {
      setError("Failed to add permission.");
    }
  }

  async function removePermission(roleId: string, permId: string) {
    try {
      await api(`roles/${roleId}/permissions/${permId}`, { method: "DELETE" });
      setRoleList((prev) =>
        prev.map((r) =>
          r.id === roleId
            ? { ...r, permissions: r.permissions.filter((p) => p !== permId) }
            : r,
        ),
      );
    } catch {
      setError("Failed to remove permission.");
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="space-y-4">
        {roleList.map((role) => {
          const unassigned = allPermissions.filter(
            (p) => !role.permissions.includes(p.id),
          );
          return (
            <div key={role.id} className="rounded-xl border p-4">
              <div className="mb-3">
                <p className="font-medium text-sm">{role.id}</p>
                <p className="text-muted-foreground text-xs">
                  {role.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {role.permissions.map((pId) => (
                  <span
                    key={pId}
                    className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 font-mono text-xs"
                  >
                    {pId}
                    <button
                      type="button"
                      onClick={() => removePermission(role.id, pId)}
                      className="ml-1 text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {role.permissions.length === 0 && (
                  <span className="text-muted-foreground text-xs">
                    No permissions
                  </span>
                )}
              </div>
              {unassigned.length > 0 && (
                <div className="mt-3 flex gap-2">
                  <select
                    value={permInputs[role.id] ?? ""}
                    onChange={(e) =>
                      setPermInputs((prev) => ({
                        ...prev,
                        [role.id]: e.target.value,
                      }))
                    }
                    className="rounded-md border bg-background px-2 py-1 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Add permission…</option>
                    {unassigned.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => addPermission(role.id)}
                    disabled={!permInputs[role.id]}
                    className="rounded-md bg-primary px-3 py-1 text-primary-foreground text-xs disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export function RbacPage() {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<Role[]>("roles"), api<Permission[]>("permissions")])
      .then(([r, p]) => {
        setRoles(r);
        setPermissions(p);
      })
      .catch(() => setError("Failed to load RBAC data."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">RBAC</h1>
          <p className="text-muted-foreground text-sm">
            Manage roles and permissions
          </p>
        </div>
        <Link
          href="/admin"
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          ← Admin
        </Link>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {!loading && (
        <>
          <div className="flex gap-4 border-b">
            {(["users", "roles"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`border-b-2 pb-2 text-sm capitalize ${
                  tab === t
                    ? "border-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "users" && <UsersTab allRoles={roles} />}
          {tab === "roles" && (
            <RolesTab roles={roles} allPermissions={permissions} />
          )}
        </>
      )}
    </div>
  );
}
