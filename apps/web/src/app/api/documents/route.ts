import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";

export async function GET() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/documents`, {
    headers: await buildProxyHeaders(),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  // Forward the multipart body verbatim. Drop content-length so fetch recomputes
  // it; keep content-type so FastAPI can parse the multipart boundary.
  const proxyHdrs = await buildProxyHeaders();
  const contentType = req.headers.get("content-type");
  const res = await fetch(`${API_URL}/documents`, {
    method: "POST",
    headers: {
      ...(proxyHdrs as Record<string, string>),
      ...(contentType ? { "content-type": contentType } : {}),
    },
    body: req.body,
    // @ts-expect-error — required for streaming bodies in undici
    duplex: "half",
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
