import { headers } from "next/headers";
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const res = await fetch(`${API_URL}/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: await buildProxyHeaders(),
  });
  if (res.status === 204) return new Response(null, { status: 204 });
  const data = await res.text();
  return new Response(data, { status: res.status });
}
