import { Image } from "expo-image";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { ChatAttachment } from "./types";

type Props = {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
};

export function AttachmentPreviewRow({ attachments, onRemove }: Props) {
  if (attachments.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-3 pb-2"
    >
      {attachments.map((a) => (
        <View key={a.id} className="relative">
          <Image
            source={{ uri: a.uri }}
            style={{ width: 64, height: 64, borderRadius: 8 }}
          />
          <Pressable
            onPress={() => onRemove(a.id)}
            hitSlop={6}
            className="absolute -top-1 -right-1 h-5 w-5 items-center justify-center rounded-full bg-foreground"
          >
            <Text className="font-semibold text-background text-xs">×</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
