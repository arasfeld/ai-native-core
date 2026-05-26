import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function GET(req: NextRequest): Promise<Response> {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = `${API_URL}/conversations/search${req.nextUrl.search}`;
  const res = await fetch(url, {
    headers: { cookie: hdrs.get("cookie") ?? "" },
    cache: "no-store",
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
