import type { UIMessage } from "ai";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Chat } from "@/app/chat";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

type RawMessage = { role: string; content: string };

async function fetchMessages(
  conversationId: string,
  cookieHeader: string,
): Promise<RawMessage[]> {
  try {
    const res = await fetch(
      `${API_URL}/conversations/${conversationId}/messages`,
      { headers: { cookie: cookieHeader } },
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) redirect("/login");

  const raw = await fetchMessages(id, hdrs.get("cookie") ?? "");
  const initialMessages: UIMessage[] = raw.map((m, i) => ({
    id: String(i),
    role: m.role === "human" ? "user" : "assistant",
    parts: [{ type: "text", text: m.content }],
    content: m.content,
    createdAt: new Date(),
  }));

  return <Chat conversationId={id} initialMessages={initialMessages} />;
}
