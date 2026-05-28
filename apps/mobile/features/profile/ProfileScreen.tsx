import {
  Button,
  Heading,
  Screen,
  Surface,
  Text,
  TextField,
  UserAvatar,
  useToast,
} from "@repo/ui-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { authClient } from "@/lib/auth-client";

export function ProfileScreen() {
  const toast = useToast();
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailHint, setEmailHint] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setEmail(user.email ?? "");
  }, [user]);

  const saveName = async () => {
    if (!name || name === user?.name) return;
    setSavingName(true);
    try {
      const res = await authClient.updateUser({ name });
      if (res.error) {
        toast.error("Save failed", res.error.message);
        return;
      }
      toast.success("Name updated");
    } finally {
      setSavingName(false);
    }
  };

  const saveEmail = async () => {
    if (!email || email === user?.email) return;
    setSavingEmail(true);
    setEmailHint(null);
    try {
      const res = await authClient.changeEmail({ newEmail: email });
      if (res.error) {
        toast.error("Email change failed", res.error.message);
        return;
      }
      setEmailHint("Check your inbox to confirm the new email.");
    } finally {
      setSavingEmail(false);
    }
  };

  if (!user) {
    return (
      <Screen className="items-center justify-center">
        <Text tone="muted">Not signed in.</Text>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      contentContainerClassName="px-6 pt-safe-offset-4 pb-12 gap-6"
    >
      <View className="items-center gap-3">
        <UserAvatar user={{ name: user.name, image: user.image }} size="xl" />
        <Heading level={3}>{user.name}</Heading>
        <Text tone="muted" size="sm">
          {user.email}
        </Text>
      </View>

      <Surface variant="default" radius="md" className="gap-4 p-4">
        <View className="gap-2">
          <Text weight="semibold">Name</Text>
          <TextField>
            <TextField.Input
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
            />
          </TextField>
          <Button
            onPress={saveName}
            isDisabled={!name || name === user.name || savingName}
            isLoading={savingName}
            size="sm"
          >
            Save name
          </Button>
        </View>

        <View className="gap-2">
          <Text weight="semibold">Email</Text>
          <TextField>
            <TextField.Input
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </TextField>
          {emailHint ? (
            <Text size="xs" tone="muted">
              {emailHint}
            </Text>
          ) : null}
          <Button
            onPress={saveEmail}
            isDisabled={!email || email === user.email || savingEmail}
            isLoading={savingEmail}
            size="sm"
          >
            Save email
          </Button>
        </View>
      </Surface>
    </Screen>
  );
}
