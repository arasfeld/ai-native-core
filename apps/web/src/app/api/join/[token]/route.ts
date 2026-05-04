import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/join/${token}`, {
    headers: proxyHeaders,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(_request: Request, { params }: Params) {
  const { token } = await params;
  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(`${API_URL}/join/${token}`, {
    method: "POST",
    headers: proxyHeaders,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
