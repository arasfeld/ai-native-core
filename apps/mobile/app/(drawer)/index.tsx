import { useCallback, useRef, useState } from "react";
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
import { nanoid } from "nanoid/non-secure";
import { API_URL } from "@/constants/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SESSION_ID = nanoid();

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    const userMsg: Message = { id: nanoid(), role: "user", content: text };
    const assistantId = nanoid();

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: SESSION_ID }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";

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
          full += token === "" ? "\n" : token;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: full } : m)),
          );
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: "Error: " + String(err) } : m,
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

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
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View
            className={
              "max-w-[80%] rounded-xl px-3.5 py-2.5 " +
              (item.role === "user" ? "self-end bg-primary" : "self-start bg-secondary")
            }
          >
            <Text
              className={
                "text-[15px] leading-6 " +
                (item.role === "user" ? "text-primary-foreground" : "text-secondary-foreground")
              }
            >
              {item.content || (loading && item.role === "assistant" ? "…" : "")}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center pt-20">
            <Text className="text-[15px] text-muted-foreground">Start a conversation</Text>
          </View>
        }
      />

      <View
        className="flex-row items-end gap-2 border-t border-border bg-background px-3 pt-2"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        <TextInput
          className="max-h-[120px] flex-1 rounded-2xl border border-border bg-secondary px-3.5 py-2.5 text-[15px] text-foreground"
          value={input}
          onChangeText={setInput}
          placeholder="Message..."
          placeholderTextColorClassName="text-muted-foreground"
          multiline
          onSubmitEditing={sendMessage}
        />
        <Pressable
          onPress={sendMessage}
          disabled={!input.trim() || loading}
          className={
            "h-10 w-10 items-center justify-center rounded-full " +
            (!input.trim() || loading ? "bg-muted" : "bg-primary")
          }
        >
          {loading ? (
            <ActivityIndicator size="small" className="text-primary-foreground" />
          ) : (
            <Text className="text-lg font-semibold text-primary-foreground">↑</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
