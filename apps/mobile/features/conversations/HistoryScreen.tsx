import { EmptyState, Screen, Spinner, TextField } from "@repo/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type Conversation,
  useConversationSearch,
  useConversations,
} from "./api";
import { ConversationRow } from "./ConversationRow";

export function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useConversations();
  const searchQuery = useConversationSearch(debouncedSearch);

  const isSearching = debouncedSearch.length >= 2;
  const isLoading = isSearching ? searchQuery.isLoading : listQuery.isLoading;
  const items: Conversation[] = isSearching
    ? (searchQuery.data ?? []).map((r) => ({
        id: r.conversation_id,
        title: r.title,
        system_instructions: "",
        created_at: null,
        updated_at: r.updated_at,
      }))
    : (listQuery.data ?? []);

  return (
    <Screen className="px-4" style={{ paddingTop: insets.top + 8 }}>
      <View className="pb-3">
        <TextField>
          <TextField.Input
            placeholder="Search conversations..."
            value={searchInput}
            onChangeText={setSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </TextField>
      </View>

      {isLoading && items.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Spinner size="md" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerClassName="gap-2 pb-12"
          ItemSeparatorComponent={null}
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              onPress={() =>
                router.push({
                  pathname: "/",
                  params: { conversation: item.id },
                })
              }
            />
          )}
          refreshControl={
            isSearching ? undefined : (
              <RefreshControl
                refreshing={listQuery.isRefetching}
                onRefresh={() => listQuery.refetch()}
              />
            )
          }
          ListEmptyComponent={
            <EmptyState
              title={isSearching ? "No matches" : "No conversations yet"}
              description={
                isSearching
                  ? `Nothing matched "${debouncedSearch}".`
                  : "Start a chat to see it listed here."
              }
            />
          }
        />
      )}
    </Screen>
  );
}
