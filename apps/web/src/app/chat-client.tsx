"use client";

import dynamic from "next/dynamic";

export const ChatClient = dynamic(
  () => import("@/features/chat").then((m) => m.ChatInterface),
  { ssr: false },
);
