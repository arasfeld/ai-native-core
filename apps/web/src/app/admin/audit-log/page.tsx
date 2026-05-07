import { headers } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

async function getAuditLogs(): Promise<AuditLogEntry[]> {
  const hdrs = await headers();
  const res = await fetch(`${API_URL}/admin/audit-logs?limit=50`, {
    headers: { cookie: hdrs.get("cookie") ?? "" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function AuditLogPage() {
  const entries = await getAuditLogs();

  return (
    <div className="p-8">
      <h1 className="mb-6 font-semibold text-2xl">Audit Log</h1>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium">Actor</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
              <th className="px-4 py-3 text-left font-medium">Resource</th>
              <th className="px-4 py-3 text-left font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No audit events yet.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">{entry.actor_email ?? "—"}</td>
                <td className="px-4 py-3 font-mono">{entry.action}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {entry.resource_type}
                  {entry.resource_id ? `:${entry.resource_id}` : ""}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {entry.ip_address ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
