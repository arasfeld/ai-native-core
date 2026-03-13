import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  isTextUIPart,
  type UIMessage,
} from "ai";
import { nanoid } from "nanoid";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const messages: UIMessage[] = body.messages ?? [];
  const lastMessage = messages[messages.length - 1];

  if (!lastMessage) {
    return new Response("No message provided", { status: 400 });
  }

  // Extract all parts (text and images)
  const content = lastMessage.parts
    .map((part) => {
      if (part.type === "text") {
        return { type: "text", text: part.text };
      }
      if (part.type === "file" && part.mediaType.startsWith("image/")) {
        return {
          type: "image_url",
          image_url: { url: part.url },
        };
      }
      return null;
    })
    .filter((p) => p !== null);

  // Fallback to simple string if it's just text
  const messagePayload =
    content.length > 0 && content.some((p) => p.type === "image_url")
      ? content
      : lastMessage.parts
          .filter(isTextUIPart)
          .map((p) => p.text)
          .join("");

  const sessionId = req.cookies.get("session-id")?.value ?? crypto.randomUUID();

  // Forward optional location from the client
  const lat: number | undefined = body.lat;
  const lng: number | undefined = body.lng;

  const sessionToken = req.cookies.get("better-auth.session_token")?.value;

  let fastApiRes: Response;
  try {
    fastApiRes = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({
        message: messagePayload,
        session_id: sessionId,
        ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
      }),
    });
  } catch {
    return new Response("Failed to connect to AI service", { status: 502 });
  }

  if (!fastApiRes.ok) {
    const errorText = await fastApiRes.text().catch(() => "No error body");
    return new Response(`AI service error: ${errorText}`, { status: fastApiRes.status });
  }

  const textId = nanoid();
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "text-start", id: textId });

      const reader = fastApiRes.body?.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const match = part.match(/^data: (.*)/m);
            if (!match) continue;
            const token = match[1] ?? "";
            if (token === "[DONE]") continue;
            const delta = token === "" ? "\n" : token;
            writer.write({ type: "text-delta", id: textId, delta });
          }
        }
      } finally {
        writer.write({ type: "text-end", id: textId });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
