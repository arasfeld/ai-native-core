import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Chat } from "@/app/chat";
import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export default async function ChatPage() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });

  if (session) {
    const user = session.user as {
      onboardingCompletedAt?: Date | string | null;
    };
    if (!user.onboardingCompletedAt) {
      redirect("/onboarding");
    }

    const id = nanoid();
    try {
      await fetch(`${API_URL}/conversations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: hdrs.get("cookie") ?? "",
        },
        body: JSON.stringify({ id }),
      });
    } catch {
      // Non-fatal — conversation row will be created lazily on first message
    }
    redirect(`/chat/${id}`);
  }

  // Guest: render chat directly with ephemeral session
  return <Chat conversationId="default" />;
}
