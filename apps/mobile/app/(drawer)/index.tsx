import { useChat } from "@ai-sdk/react";
import { Button, Surface, TextField } from "@repo/ui-native";
import { DefaultChatTransport, type UIMessage } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [input, setInput] = useState("");
  const { coords } = useLocation();
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const { messages, status, error, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      fetch: fetchWithAuth as unknown as typeof globalThis.fetch,
      api: `${WEB_URL}/api/chat`,
      body: () => coordsRef.current ?? {},
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
                ? "self-end bg-primary"
                : "self-start bg-secondary")
            }
          >
            {(item as UIMessage).parts.map((part, i) => {
              if (part.type !== "text") return null;
              // Parts are append-only stream chunks for a fixed message;
              // their order is stable so the index is a stable key.
              const partKey = `${item.id}-${i}`;
              return (
                <Text
                  key={partKey}
                  className={
                    "text-[15px] leading-6" +
                    (item.role === "user"
                      ? "text-primary-foreground"
                      : "text-secondary-foreground")
                  }
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
            <Text className="text-[15px] text-muted-foreground">
              Start a conversation
            </Text>
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
