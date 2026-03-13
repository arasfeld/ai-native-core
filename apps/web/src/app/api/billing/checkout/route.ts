import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "";

export async function POST(_req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/billing/checkout`, {
    method: "POST",
    headers: {
      "x-user-email": session.user.email,
      "x-internal-secret": INTERNAL_SECRET,
    },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
