"use client";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import { EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { nanoid } from "nanoid";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Conversation = {
  id: string;
  title: string;
  updated_at: string;
};

type GroupKey = "Today" | "Yesterday" | "This week" | "Older";
type Groups = Record<GroupKey, Conversation[]>;

function groupByRecency(convs: Conversation[]): Groups {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const groups: Groups = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Older: [],
  };
  for (const c of convs) {
    const d = new Date(c.updated_at);
    if (d >= startOfToday) groups.Today.push(c);
    else if (d >= startOfYesterday) groups.Yesterday.push(c);
    else if (d >= startOfWeek) groups["This week"].push(c);
    else groups.Older.push(c);
  }
  return groups;
}

const GROUP_ORDER: GroupKey[] = ["Today", "Yesterday", "This week", "Older"];

export function ConversationSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) setConversations(await res.json());
    } catch {
      // ignore network errors
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is a trigger, not a value used inside the callback
  useEffect(() => {
    fetchConversations();
  }, [pathname, fetchConversations]);

  async function handleNewChat() {
    const id = nanoid();
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.push(`/chat/${id}`);
    fetchConversations();
  }

  function startRename(conv: Conversation) {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }

  async function commitRename(id: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    setRenamingId(null);
    fetchConversations();
  }

  async function handleDelete(conv: Conversation) {
    await fetch(`/api/conversations/${conv.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    const isActive = pathname === `/chat/${conv.id}`;
    await fetchConversations();
    if (isActive) {
      const id = nanoid();
      await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      router.push(`/chat/${id}`);
    }
  }

  const groups = groupByRecency(conversations);

  return (
    <>
      <aside className="flex w-60 shrink-0 flex-col border-r bg-background">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="font-medium text-sm">Conversations</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNewChat}
            title="New chat"
          >
            <PlusIcon className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {GROUP_ORDER.map((label) => {
            const items = groups[label];
            if (items.length === 0) return null;
            return (
              <div key={label} className="mb-2">
                <p className="px-3 py-1 font-medium text-muted-foreground text-xs">
                  {label}
                </p>
                {items.map((conv) => {
                  const isActive = pathname === `/chat/${conv.id}`;
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      className={`group mx-1 flex w-full cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${isActive ? "bg-accent font-medium" : ""}`}
                      onClick={() => {
                        if (renamingId !== conv.id)
                          router.push(`/chat/${conv.id}`);
                      }}
                    >
                      {renamingId === conv.id ? (
                        <Input
                          ref={renameInputRef}
                          value={renameValue}
                          className="h-6 flex-1 px-1 text-sm"
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(conv.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(conv.id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="flex-1 truncate">{conv.title}</span>
                      )}

                      {renamingId !== conv.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 opacity-0 focus:opacity-100 group-hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <EllipsisIcon className="size-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                startRename(conv);
                              }}
                            >
                              <PencilIcon className="mr-2 size-3" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(conv);
                              }}
                            >
                              <Trash2Icon className="mr-2 size-3" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {conversations.length === 0 && (
            <p className="px-3 py-4 text-center text-muted-foreground text-xs">
              No conversations yet
            </p>
          )}
        </div>
      </aside>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
