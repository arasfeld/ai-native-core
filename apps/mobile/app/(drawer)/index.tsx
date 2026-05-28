import { useChat } from "@ai-sdk/react";
import { Button, Surface, Text, TextField } from "@repo/ui-native";
import { DefaultChatTransport, type UIMessage } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConversationMessages } from "@/features/conversations/api";
import { useLocation } from "@/hooks/use-location";
import { WEB_URL } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

function fetchWithAuth(
  url: RequestInfo | URL,
  opts?: RequestInit,
): Promise<Response> {
  const cookies = authClient.getCookie();
  const headers = {
    ...(opts?.headers as Record<string, string>),
    ...(cookies ? { Cookie: cookies } : {}),
  };
  return expoFetch(
    url as Parameters<typeof expoFetch>[0],
    {
      ...opts,
      headers,
    } as Parameters<typeof expoFetch>[1],
  ) as unknown as Promise<Response>;
}

function messagesToUIMessages(
  msgs: { role: string; content: string }[],
): UIMessage[] {
  return msgs.map((m, i) => ({
    id: `init-${i}`,
    role: m.role as UIMessage["role"],
    parts: [{ type: "text", text: m.content }],
  }));
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [input, setInput] = useState("");
  const { coords } = useLocation();
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const params = useLocalSearchParams<{ conversation?: string }>();
  const conversationId = params.conversation ?? "default";
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const { data: initialMessages } = useConversationMessages(
    conversationId === "default" ? null : conversationId,
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        fetch: fetchWithAuth as unknown as typeof globalThis.fetch,
        api: `${WEB_URL}/api/chat`,
        body: () => ({
          ...(coordsRef.current ?? {}),
          session_id: conversationIdRef.current,
        }),
      }),
    [],
  );

  const { messages, status, error, sendMessage, setMessages } = useChat({
    transport,
    onError: (err) => console.error("Chat error:", err),
  });

  // Hydrate from server when ?conversation= changes.
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(messagesToUIMessages(initialMessages));
    } else if (conversationId === "default") {
      setMessages([]);
    }
  }, [initialMessages, conversationId, setMessages]);

  const isBusy = status === "submitted" || status === "streaming";

  const onSubmit = () => {
    const text = input.trim();
    if (!text || isBusy) return;
    sendMessage({ text });
    setInput("");
  };

  const onNewConversation = () => {
    router.setParams({ conversation: undefined });
    setMessages([]);
  };

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <View className="rounded-xl bg-secondary p-4">
          <Text weight="semibold" tone="destructive" className="mb-1">
            {error.message}
          </Text>
          <Text size="sm" tone="muted">
            Please check your connection and try again.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.top + 44}
    >
      <View className="flex-row items-center justify-end px-3 pt-1">
        <Pressable
          onPress={onNewConversation}
          hitSlop={8}
          className="px-2 py-1"
        >
          <Text size="sm" tone="primary">
            New
          </Text>
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerClassName="p-4 gap-3"
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        renderItem={({ item }) => (
          <View
            className={
              "max-w-[80%] rounded-xl px-3.5 py-2.5" +
              (item.role === "user"
                ? "self-end bg-primary"
                : "self-start bg-secondary")
            }
          >
            {(item as UIMessage).parts.map((part, i) => {
              if (part.type !== "text") return null;
              const partKey = `${item.id}-${i}`;
              return (
                <Text
                  key={partKey}
                  tone={item.role === "user" ? "primary-foreground" : "default"}
                  size="base"
                >
                  {part.text}
                </Text>
              );
            })}
          </View>
        )}
        ListFooterComponent={
          isBusy ? (
            <View className="self-start rounded-xl bg-secondary px-3.5 py-2.5">
              <ActivityIndicator size="small" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center pt-20">
            <Text tone="muted">Start a conversation</Text>
          </View>
        }
      />

      <Surface
        variant="default"
        radius="none"
        className="flex-row items-end gap-2 border-border/60 border-t px-3 pt-2"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        <TextField className="flex-1">
          <TextField.Input
            value={input}
            onChangeText={setInput}
            placeholder="Message..."
            multiline
            onSubmitEditing={onSubmit}
          />
        </TextField>
        <Button
          variant="primary"
          size="md"
          isIconOnly
          isDisabled={!input.trim() || isBusy}
          isLoading={isBusy}
          onPress={onSubmit}
        >
          ↑
        </Button>
      </Surface>
    </KeyboardAvoidingView>
  );
}
