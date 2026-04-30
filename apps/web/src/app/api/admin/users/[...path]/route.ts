import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user.isAdmin) return new Response("Forbidden", { status: 403 });

  // Reset-password is handled here — calls better-auth directly
  if (req.method === "POST" && path.at(-1) === "reset-password") {
    const body = (await req.json()) as { email: string };
    await auth.api.requestPasswordReset({
      body: { email: body.email, redirectTo: "/reset-password" },
      headers: hdrs,
    });
    return new Response(null, { status: 204 });
  }

  const url = `${API_URL}/admin/users/${path.join("/")}${req.nextUrl.search}`;
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await params).path);
}

export async function POST(
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
