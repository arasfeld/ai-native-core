import { headers } from "next/headers";
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";

type Params = { params: Promise<{ inviteId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { inviteId } = await params;
  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(
    `${API_URL}/organizations/current/invites/${inviteId}`,
    { method: "DELETE", headers: proxyHeaders },
  );
  if (res.status === 204) return new Response(null, { status: 204 });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
