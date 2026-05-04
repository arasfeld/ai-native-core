import { headers } from "next/headers";
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";

export async function GET() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/organizations/current`, {
    headers: proxyHeaders,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function PATCH(request: Request) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const body = await request.json();
  const res = await fetch(`${API_URL}/organizations/current`, {
    method: "PATCH",
    headers: { ...proxyHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
