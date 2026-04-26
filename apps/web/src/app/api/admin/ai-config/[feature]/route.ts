import { headers } from "next/headers";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ feature: string }> },
) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { feature } = await params;
  const body = await req.json();

  const res = await fetch(`${API_URL}/admin/ai-config/${feature}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      cookie: hdrs.get("cookie") ?? "",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
