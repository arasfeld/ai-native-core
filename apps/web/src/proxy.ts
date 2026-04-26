import { betterFetch } from "@better-fetch/fetch";
// Use import type — erased at compile time, never executed in Edge runtime
import type { Session } from "@repo/auth";
import { type NextRequest, NextResponse } from "next/server";

// Paths that never require authentication
const PUBLIC_PATHS = [
  "/",
  "/chat",
  "/login",
  "/register",
  "/api/auth",
  "/_next",
  "/favicon.ico",
];

// Paths that always require authentication
const PROTECTED_PATHS = ["/admin", "/billing", "/profile", "/settings"];

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Always allow public paths
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  // Only gate explicitly protected paths
  if (!PROTECTED_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const { data: session, error } = await betterFetch<Session>(
    "/api/auth/get-session",
    {
      baseURL: req.nextUrl.origin,
      headers: {
        cookie: req.headers.get("cookie") ?? "",
      },
    },
  );

  if (error) {
    console.error("Proxy: session fetch error", error);
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const proxyConfig = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
