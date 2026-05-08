"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Analytics", href: "/admin/analytics" },
  { label: "Users", href: "/admin/users" },
  { label: "Tenants", href: "/admin/tenants" },
  { label: "RBAC", href: "/admin/rbac" },
  { label: "Audit Log", href: "/admin/audit-log" },
  { label: "AI Config", href: "/admin" },
] as const;

function isActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="w-48 shrink-0 border-r bg-muted/30 p-4">
      <p className="mb-4 font-semibold text-muted-foreground text-xs uppercase tracking-widest">
        Admin
      </p>
      <ul className="space-y-1">
        {NAV_ITEMS.map(({ label, href }) => (
          <li key={href}>
            <Link
              href={href}
              className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                isActive(href, pathname)
                  ? "bg-primary/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
