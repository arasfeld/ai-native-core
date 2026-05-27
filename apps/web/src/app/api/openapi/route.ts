const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function GET() {
  const res = await fetch(`${API_URL}/openapi.json`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    return new Response("Failed to fetch OpenAPI spec", { status: res.status });
  }
  const spec = (await res.json()) as Record<string, unknown>;

  const servers = [{ url: API_URL, description: "AI Native Core API" }];
  const enriched = { ...spec, servers };

  return Response.json(enriched, {
    headers: { "cache-control": "public, max-age=60" },
  });
}
