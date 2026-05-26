import { headers } from "next/headers";
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";

async function requireSession() {
  const hdrs = await headers();
  return auth.api.getSession({ headers: hdrs });
}

export async function GET() {
  const session = await requireSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/preferences`, {
    headers: await buildProxyHeaders(),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function PUT(req: Request) {
  const session = await requireSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const res = await fetch(`${API_URL}/preferences`, {
    method: "PUT",
    headers: {
      ...(await buildProxyHeaders()),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
