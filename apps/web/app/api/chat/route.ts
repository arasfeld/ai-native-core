import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  isTextUIPart,
  type UIMessage,
} from "ai";
import { nanoid } from "nanoid";
import type { NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages: UIMessage[] = body.messages ?? [];
  const lastMessage = messages[messages.length - 1];

  const text = lastMessage?.parts?.filter(isTextUIPart).map((p) => p.text).join("") ?? "";

  const sessionId = req.cookies.get("session-id")?.value ?? crypto.randomUUID();

  let fastApiRes: Response;
  try {
    fastApiRes = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, session_id: sessionId }),
    });
  } catch {
    return new Response("Failed to connect to AI service", { status: 502 });
  }

  if (!fastApiRes.ok || !fastApiRes.body) {
    return new Response("AI service error", { status: 502 });
  }

  const textId = nanoid();
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "text-start", id: textId });

      const reader = fastApiRes.body!.getReader();
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
