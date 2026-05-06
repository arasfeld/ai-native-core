import type { UIMessage } from "ai";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Chat } from "@/app/chat";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

type RawMessage = { role: string; content: string };
type ConversationData = { system_instructions: string } | null;

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

async function fetchConversation(
  conversationId: string,
  cookieHeader: string,
): Promise<ConversationData> {
  try {
    const res = await fetch(`${API_URL}/conversations`, {
      headers: { cookie: cookieHeader },
    });
    if (!res.ok) return null;
    const list: Array<{ id: string; system_instructions: string }> =
      await res.json();
    return list.find((c) => c.id === conversationId) ?? null;
  } catch {
    return null;
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

  const cookieHeader = hdrs.get("cookie") ?? "";
  const [raw, conversation] = await Promise.all([
    fetchMessages(id, cookieHeader),
    fetchConversation(id, cookieHeader),
  ]);

  const initialMessages: UIMessage[] = raw.map((m, i) => ({
    id: String(i),
    role: m.role === "human" ? "user" : "assistant",
    parts: [{ type: "text", text: m.content }],
    content: m.content,
    createdAt: new Date(),
  }));

  return (
    <Chat
      conversationId={id}
      initialMessages={initialMessages}
      systemInstructions={conversation?.system_instructions ?? ""}
    />
  );
}
