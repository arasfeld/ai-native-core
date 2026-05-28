import { useActionSheet } from "@expo/react-native-action-sheet";
import { Button, useToast } from "@repo/ui-native";
import * as ImagePicker from "expo-image-picker";
import type { ChatAttachment } from "./types";

let nextId = 0;
function makeId() {
  nextId += 1;
  return `att-${Date.now()}-${nextId}`;
}

type Props = {
  onAdd: (attachment: ChatAttachment) => void;
  disabled?: boolean;
};

export function AttachmentPicker({ onAdd, disabled }: Props) {
  const { showActionSheetWithOptions } = useActionSheet();
  const toast = useToast();

  const handleResult = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset || !asset.base64) return;
    const mimeType = asset.mimeType ?? "image/jpeg";
    onAdd({
      id: makeId(),
      uri: asset.uri,
      mimeType,
      base64: asset.base64,
    });
  };

  const open = () => {
    showActionSheetWithOptions(
      {
        options: ["Photo library", "Take photo", "Cancel"],
        cancelButtonIndex: 2,
      },
      async (i) => {
        try {
          if (i === 0) {
            const perm =
              await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
              toast.error("Photo library access denied");
              return;
            }
            handleResult(
              await ImagePicker.launchImageLibraryAsync({
                mediaTypes: "images",
                base64: true,
                quality: 0.8,
              }),
            );
          } else if (i === 1) {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              toast.error("Camera access denied");
              return;
            }
            handleResult(
              await ImagePicker.launchCameraAsync({
                mediaTypes: "images",
                base64: true,
                quality: 0.8,
              }),
            );
          }
        } catch (e) {
          toast.error(
            "Image picker failed",
            e instanceof Error ? e.message : undefined,
          );
        }
      },
    );
  };

  return (
    <Button
      variant="ghost"
      size="md"
      isIconOnly
      onPress={open}
      isDisabled={disabled}
    >
      📎
    </Button>
  );
}
