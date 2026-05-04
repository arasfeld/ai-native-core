import { headers } from "next/headers";
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/organizations/join/${token}`, {
    headers: proxyHeaders,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/organizations/join/${token}`, {
    method: "POST",
    headers: proxyHeaders,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
