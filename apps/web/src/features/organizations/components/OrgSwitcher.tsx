"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/popover";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useEffect, useState } from "react";

type Org = {
  id: string;
  name: string;
  slug: string | null;
  role: string;
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function setActiveOrgCookie(orgId: string) {
  // Plain document.cookie write — cookieStore is not yet broadly supported and
  // we need this readable from middleware on the same request.
  // biome-ignore lint/suspicious/noDocumentCookie: see above
  document.cookie = `active_org_id=${orgId}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export function OrgSwitcher() {
  const [currentOrg, setCurrentOrg] = useState<Org | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/organizations/current")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Org | null) => {
        if (data) setCurrentOrg(data);
      })
      .catch(() => null);
  }, []);

  function handleSelect(org: Org) {
    setActiveOrgCookie(org.id);
    setCurrentOrg(org);
    setOpen(false);
    window.location.reload();
  }

  // Single org or loading: show initials badge only, no dropdown
  if (!currentOrg) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm hover:bg-accent"
        >
          <span className="font-medium">{getInitials(currentOrg.name)}</span>
          <span className="max-w-24 truncate text-muted-foreground text-xs">
            {currentOrg.name}
          </span>
          <ChevronsUpDownIcon className="size-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <button
          key={currentOrg.id}
          type="button"
          onClick={() => handleSelect(currentOrg)}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
        >
          <span className="flex size-6 items-center justify-center rounded bg-muted font-medium text-xs">
            {getInitials(currentOrg.name)}
          </span>
          <span className="flex-1 truncate text-left">{currentOrg.name}</span>
          <CheckIcon className="size-3.5" />
        </button>
      </PopoverContent>
    </Popover>
  );
}
