import { cookies, headers } from "next/headers";

export const API_URL = process.env.API_URL ?? "http://localhost:8000";

/**
 * Build headers for proxied requests to FastAPI:
 * - Forwards session cookie for auth
 * - Forwards active_org_id cookie as X-Org-Id header
 */
export async function buildProxyHeaders(): Promise<HeadersInit> {
  const hdrs = await headers();
  const jar = await cookies();
  const orgId = jar.get("active_org_id")?.value;

  const result: Record<string, string> = {
    cookie: hdrs.get("cookie") ?? "",
  };
  if (orgId) result["X-Org-Id"] = orgId;
  return result;
}
