import { nanoid } from "nanoid";
import type { NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  const { message, system_prompt } = await req.json();

  // Each playground run gets an isolated session so it never pollutes history
  const sessionId = `playground-${nanoid()}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, session_id: sessionId, system_prompt }),
    });
  } catch {
    return new Response("Failed to connect to AI service", { status: 502 });
  }

  if (!res.ok || !res.body) {
    return new Response("AI service error", { status: 502 });
  }

  // Pass the SSE stream straight through — the client parses it directly
  return new Response(res.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
