import { headers } from "next/headers";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { ConversationSidebar } from "@/features/chat/components/ConversationSidebar";

export default async function ChatLayout({
  children,
}: {
  children: ReactNode;
}) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });

  return (
    <div className="flex h-screen">
      {session && <ConversationSidebar />}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
