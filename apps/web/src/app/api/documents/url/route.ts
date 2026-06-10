import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";

export async function POST(req: NextRequest) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await req.text();
  const res = await fetch(`${API_URL}/documents/url`, {
    method: "POST",
    headers: {
      ...(await buildProxyHeaders()),
      "content-type": "application/json",
    },
    body,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
