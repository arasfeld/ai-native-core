"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/popover";
import type { ReactNode } from "react";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: Notification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
  children: ReactNode;
};

function borderColor(type: string): string {
  if (type === "budget_warning") return "border-l-amber-500";
  if (type === "security_alert") return "border-l-red-500";
  if (type === "welcome") return "border-l-green-500";
  return "border-l-primary";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationPopover({
  open,
  onOpenChange,
  notifications,
  unreadCount,
  onMarkAllRead,
  onMarkRead,
  children,
}: Props) {
  const visible = notifications.slice(0, 10);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-medium text-sm">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="text-muted-foreground text-xs hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
            No notifications
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((n) => (
              <li
                key={n.id}
                className={`flex gap-3 border-l-4 px-4 py-3 ${borderColor(n.type)} ${
                  n.read_at === null ? "bg-muted/40" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{n.title}</p>
                  <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
                    {n.body}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {relativeTime(n.created_at)}
                  </p>
                </div>
                {n.read_at === null && (
                  <button
                    type="button"
                    onClick={() => onMarkRead(n.id)}
                    className="mt-0.5 shrink-0 text-muted-foreground text-xs hover:text-foreground"
                    aria-label="Mark as read"
                  >
                    ✓
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
