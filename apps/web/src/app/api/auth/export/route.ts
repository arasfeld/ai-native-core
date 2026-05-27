import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function GET(_req: NextRequest) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/auth/export`, {
    method: "GET",
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });

  if (!res.ok) {
    return new Response("Failed to export data", { status: res.status });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
      "Content-Disposition":
        res.headers.get("content-disposition") ??
        'attachment; filename="user-data.json"',
    },
  });
}
