import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Conversation = {
  id: string;
  title: string;
  system_instructions: string;
  created_at: string | null;
  updated_at: string | null;
};

export type Message = {
  role: string;
  content: string;
};

export type SearchResult = {
  conversation_id: string;
  title: string;
  updated_at: string | null;
  match_type: "title" | "message";
  snippet: string;
  role: string | null;
};

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const res = await api.get("/conversations");
      if (!res.ok) throw new Error("Failed to load conversations");
      return (await res.json()) as Conversation[];
    },
  });
}

export function useConversationSearch(query: string) {
  return useQuery({
    queryKey: ["conversations", "search", query],
    queryFn: async () => {
      const res = await api.get(
        `/conversations/search?q=${encodeURIComponent(query)}`,
      );
      if (!res.ok) throw new Error("Search failed");
      return (await res.json()) as SearchResult[];
    },
    enabled: query.trim().length >= 2,
  });
}

export function useConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["conversation", conversationId, "messages"],
    queryFn: async () => {
      if (!conversationId) return [] as Message[];
      const res = await api.get(`/conversations/${conversationId}/messages`);
      if (!res.ok) throw new Error("Failed to load messages");
      return (await res.json()) as Message[];
    },
    enabled: !!conversationId,
  });
}

export function useRenameConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await api.patch(`/conversations/${id}`, { title });
      if (!res.ok) throw new Error("Rename failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/conversations/${id}`);
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}
