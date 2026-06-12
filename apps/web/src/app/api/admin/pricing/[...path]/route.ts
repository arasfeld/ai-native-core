import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user.isAdmin) return new Response("Forbidden", { status: 403 });

  const url = `${API_URL}/admin/pricing/${path.join("/")}${req.nextUrl.search}`;
  const res = await fetch(url, {
    method: req.method,
    headers: {
      "content-type": "application/json",
      cookie: hdrs.get("cookie") ?? "",
    },
    body:
      req.method !== "GET" && req.method !== "DELETE"
        ? await req.text()
        : undefined,
  });

  if (res.status === 204) return new Response(null, { status: 204 });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await params).path);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await params).path);
}
