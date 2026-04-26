// Re-export the existing Chat component under the feature namespace.
// The existing chat.tsx is the implementation; this wrapper keeps page.tsx clean.
export { Chat as ChatInterface } from "@/app/chat";
