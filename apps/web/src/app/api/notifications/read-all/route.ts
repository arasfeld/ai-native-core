import { headers } from "next/headers";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function PATCH() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const res = await fetch(`${API_URL}/notifications/read-all`, {
    method: "PATCH",
    headers: { cookie: hdrs.get("cookie") ?? "" },
  });
  if (res.status === 204) return new Response(null, { status: 204 });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
