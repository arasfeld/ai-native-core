import { auth } from "@/auth";
import type { NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const accessToken = (session as { accessToken?: string }).accessToken;
  const res = await fetch(`${API_URL}/billing/portal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
