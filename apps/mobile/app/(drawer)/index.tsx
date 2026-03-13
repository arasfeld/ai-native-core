import { useChat } from "@ai-sdk/react";
import { type UIMessage, DefaultChatTransport } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authClient } from "@/lib/auth-client";
import { WEB_URL } from "@/lib/api";

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

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [input, setInput] = useState("");

  const { messages, status, error, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      fetch: fetchWithAuth as unknown as typeof globalThis.fetch,
      api: `${WEB_URL}/api/chat`,
    }),
    onError: (err) => console.error("Chat error:", err),
  });

  const isBusy = status === "submitted" || status === "streaming";

  const onSubmit = () => {
    const text = input.trim();
    if (!text || isBusy) return;
    sendMessage({ text });
    setInput("");
  };

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <View className="rounded-xl bg-secondary p-4">
          <Text className="mb-1 text-center font-medium text-destructive">
            {error.message}
          </Text>
          <Text className="text-center text-[13px] text-muted-foreground">
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
                ? " self-end bg-primary"
                : " self-start bg-secondary")
            }
          >
            {(item as UIMessage).parts.map((part, i) =>
              part.type === "text" ? (
                <Text
                  key={`${item.id}-${i}`}
                  className={
                    "text-[15px] leading-6" +
                    (item.role === "user"
                      ? " text-primary-foreground"
                      : " text-secondary-foreground")
                  }
                >
                  {part.text}
                </Text>
              ) : null,
            )}
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
            <Text className="text-[15px] text-muted-foreground">
              Start a conversation
            </Text>
          </View>
        }
      />

      <View
        className="flex-row items-end gap-2 border-border border-t bg-background px-3 pt-2"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        <TextInput
          className="max-h-[120px] flex-1 rounded-2xl border border-border bg-secondary px-3.5 py-2.5 text-[15px] text-foreground"
          value={input}
          onChangeText={setInput}
          placeholder="Message..."
          placeholderTextColorClassName="text-muted-foreground"
          multiline
          onSubmitEditing={onSubmit}
        />
        <Pressable
          onPress={onSubmit}
          disabled={!input.trim() || isBusy}
          className={
            "h-10 w-10 items-center justify-center rounded-full" +
            (!input.trim() || isBusy ? " bg-muted" : " bg-primary")
          }
        >
          {isBusy ? (
            <ActivityIndicator
              size="small"
              className="text-primary-foreground"
            />
          ) : (
            <Text className="font-semibold text-lg text-primary-foreground">
              ↑
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
