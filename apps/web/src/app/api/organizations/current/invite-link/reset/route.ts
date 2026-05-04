import { headers } from "next/headers";
import { auth } from "@/auth";
import { API_URL, buildProxyHeaders } from "@/lib/api-proxy";

export async function POST() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const proxyHeaders = await buildProxyHeaders();
  const res = await fetch(
    `${API_URL}/organizations/current/invite-link/reset`,
    { method: "POST", headers: proxyHeaders },
  );
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
