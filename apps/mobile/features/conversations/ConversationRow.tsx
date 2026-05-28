import {
  Button,
  Dialog,
  Surface,
  Text,
  TextField,
  useToast,
} from "@repo/ui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  type Conversation,
  useDeleteConversation,
  useRenameConversation,
} from "./api";

type Props = {
  conversation: Conversation;
  onPress: () => void;
};

export function ConversationRow({ conversation, onPress }: Props) {
  const toast = useToast();
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [title, setTitle] = useState(conversation.title);

  const rename = useRenameConversation();
  const del = useDeleteConversation();

  const updated = conversation.updated_at
    ? new Date(conversation.updated_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <>
      <Surface variant="default" radius="md">
        <Pressable
          onPress={onPress}
          onLongPress={() => setConfirmOpen(true)}
          className="flex-row items-center gap-3 px-4 py-3"
        >
          <View className="flex-1">
            <Text weight="semibold" numberOfLines={1}>
              {conversation.title}
            </Text>
            {updated ? (
              <Text size="xs" tone="muted">
                {updated}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              setTitle(conversation.title);
              setRenameOpen(true);
            }}
            hitSlop={8}
            className="px-2 py-1"
          >
            <Text size="sm" tone="primary">
              Edit
            </Text>
          </Pressable>
        </Pressable>
      </Surface>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Rename conversation</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <TextField>
              <TextField.Input
                value={title}
                onChangeText={setTitle}
                autoFocus
              />
            </TextField>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="outline" onPress={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              onPress={() => {
                rename.mutate(
                  { id: conversation.id, title },
                  {
                    onSuccess: () => {
                      setRenameOpen(false);
                      toast.success("Renamed");
                    },
                    onError: (e) => toast.error("Rename failed", e.message),
                  },
                );
              }}
              isDisabled={!title || rename.isPending}
              isLoading={rename.isPending}
            >
              Save
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Delete conversation?</Dialog.Title>
            <Dialog.Description>
              This will permanently remove "{conversation.title}".
            </Dialog.Description>
          </Dialog.Header>
          <Dialog.Footer>
            <Button variant="outline" onPress={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onPress={() => {
                del.mutate(conversation.id, {
                  onSuccess: () => {
                    setConfirmOpen(false);
                    toast.success("Deleted");
                  },
                  onError: (e) => toast.error("Delete failed", e.message),
                });
              }}
              isLoading={del.isPending}
            >
              Delete
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </>
  );
}
