import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function GET(_req: NextRequest) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user.isAdmin) return new Response("Forbidden", { status: 403 });

  const res = await fetch(`${API_URL}/admin/pricing`, {
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
