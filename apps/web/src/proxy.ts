import { betterFetch } from "@better-fetch/fetch";
// Use import type — erased at compile time, never executed in Edge runtime
import type { Session } from "@repo/auth";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/api/auth", "/_next", "/favicon.ico"];

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Fetch the session from the better-auth endpoint instead of importing
  // the full auth config (which pulls in DB + env validation — not Edge-safe).
  console.log(`Proxy: Checking session for ${pathname}`);
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
    console.warn(`Proxy: No session, redirecting ${pathname} to /login`);
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const proxyConfig = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
