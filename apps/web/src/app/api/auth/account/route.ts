import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function DELETE(_req: NextRequest) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/auth/account`, {
    method: "DELETE",
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });

  if (!res.ok) {
    return new Response("Failed to delete account", { status: res.status });
  }
  return new Response(null, { status: 204 });
}
