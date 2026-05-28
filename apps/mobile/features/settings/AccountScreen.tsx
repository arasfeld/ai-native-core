import {
  Button,
  Dialog,
  Screen,
  Surface,
  Text,
  TextField,
  useToast,
} from "@repo/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { authClient } from "@/lib/auth-client";

const CONFIRM_PHRASE = "DELETE";

export function AccountScreen() {
  const toast = useToast();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    if (confirmText !== CONFIRM_PHRASE) return;
    setDeleting(true);
    try {
      const res = await authClient.deleteUser();
      if (res.error) {
        toast.error("Delete failed", res.error.message);
        return;
      }
      setConfirmOpen(false);
      // Session is cleared by better-auth; root layout will route to /login.
      router.replace("/login");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Screen scroll contentContainerClassName="px-4 pt-6 pb-12 gap-6">
      <Surface
        variant="default"
        radius="md"
        className="gap-3 border-destructive/50 p-4"
      >
        <View className="gap-1">
          <Text weight="semibold" tone="destructive">
            Danger zone
          </Text>
          <Text size="sm" tone="muted">
            Permanently delete your account and all associated data. This cannot
            be undone.
          </Text>
        </View>
        <Button
          variant="destructive"
          onPress={() => {
            setConfirmText("");
            setConfirmOpen(true);
          }}
        >
          Delete account
        </Button>
      </Surface>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        isDismissable={!deleting}
      >
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Delete your account?</Dialog.Title>
            <Dialog.Description>
              Type <Text weight="bold">{CONFIRM_PHRASE}</Text> to confirm. This
              will cancel any active subscription and erase your data.
            </Dialog.Description>
          </Dialog.Header>
          <Dialog.Body>
            <TextField>
              <TextField.Input
                value={confirmText}
                onChangeText={setConfirmText}
                placeholder={CONFIRM_PHRASE}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
              />
            </TextField>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="outline" onPress={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onPress={doDelete}
              isDisabled={confirmText !== CONFIRM_PHRASE || deleting}
              isLoading={deleting}
            >
              Delete account
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </Screen>
  );
}
