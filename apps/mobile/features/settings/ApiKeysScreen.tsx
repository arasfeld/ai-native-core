import {
  Button,
  Dialog,
  EmptyState,
  Screen,
  Spinner,
  Surface,
  Text,
  TextField,
  useToast,
} from "@repo/ui-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { api } from "@/lib/api";

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
};

type CreatedKey = {
  key: string;
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
};

function useApiKeys() {
  return useQuery({
    queryKey: ["user-api-keys"],
    queryFn: async () => {
      const res = await api.get("/user/api-keys");
      if (!res.ok) throw new Error("Failed to load keys");
      return (await res.json()) as ApiKey[];
    },
  });
}

function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post("/user/api-keys", { name });
      if (!res.ok) throw new Error("Create failed");
      return (await res.json()) as CreatedKey;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-api-keys"] }),
  });
}

function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/user/api-keys/${id}`);
      if (!res.ok && res.status !== 204) throw new Error("Revoke failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-api-keys"] }),
  });
}

export function ApiKeysScreen() {
  const toast = useToast();
  const keys = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);

  const submitCreate = () => {
    if (!name) return;
    create.mutate(name, {
      onSuccess: (k) => {
        setCreatedKey(k);
        setName("");
        setCreateOpen(false);
      },
      onError: (e) => toast.error("Create failed", e.message),
    });
  };

  const copyKey = async () => {
    if (!createdKey) return;
    await Clipboard.setStringAsync(createdKey.key);
    toast.success("Copied to clipboard");
  };

  return (
    <Screen className="px-4">
      {keys.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Spinner size="md" />
        </View>
      ) : (
        <FlatList
          data={keys.data ?? []}
          keyExtractor={(k) => k.id}
          contentContainerClassName="gap-2 pt-4 pb-4"
          renderItem={({ item }) => (
            <Surface variant="default" radius="md" className="p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 gap-0.5">
                  <Text weight="semibold">{item.name}</Text>
                  <Text size="xs" tone="muted">
                    {item.key_prefix}··· · created{" "}
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    revoke.mutate(item.id, {
                      onSuccess: () => toast.success("Revoked"),
                      onError: (e) => toast.error("Revoke failed", e.message),
                    });
                  }}
                  hitSlop={8}
                  className="px-2 py-1"
                >
                  <Text size="sm" tone="destructive">
                    Revoke
                  </Text>
                </Pressable>
              </View>
            </Surface>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No API keys"
              description="Generate a key to make programmatic requests."
            />
          }
        />
      )}

      <View className="pb-4">
        <Button onPress={() => setCreateOpen(true)}>Generate new key</Button>
      </View>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>New API key</Dialog.Title>
            <Dialog.Description>
              Give this key a name so you can identify it later.
            </Dialog.Description>
          </Dialog.Header>
          <Dialog.Body>
            <TextField>
              <TextField.Input
                placeholder="My laptop"
                value={name}
                onChangeText={setName}
                autoFocus
              />
            </TextField>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="outline" onPress={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onPress={submitCreate}
              isDisabled={!name || create.isPending}
              isLoading={create.isPending}
            >
              Generate
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      <Dialog
        open={!!createdKey}
        onOpenChange={(open) => {
          if (!open) setCreatedKey(null);
        }}
        isDismissable={false}
      >
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Copy your key</Dialog.Title>
            <Dialog.Description>
              This is the only time you'll see this key. Copy it now.
            </Dialog.Description>
          </Dialog.Header>
          <Dialog.Body>
            <Surface variant="flat" radius="md" className="p-3">
              <Text size="sm" weight="medium">
                {createdKey?.key}
              </Text>
            </Surface>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="outline" onPress={copyKey}>
              Copy
            </Button>
            <Button onPress={() => setCreatedKey(null)}>Done</Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </Screen>
  );
}
