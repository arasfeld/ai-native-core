import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = `${API_URL}/conversations/${id}/export${req.nextUrl.search}`;
  const res = await fetch(url, {
    headers: { cookie: hdrs.get("cookie") ?? "" },
    cache: "no-store",
  });

  const passthrough = new Headers();
  const ct = res.headers.get("content-type");
  const cd = res.headers.get("content-disposition");
  if (ct) passthrough.set("content-type", ct);
  if (cd) passthrough.set("content-disposition", cd);
  return new Response(res.body, { status: res.status, headers: passthrough });
}
