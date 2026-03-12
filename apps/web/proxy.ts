import { betterFetch } from "@better-fetch/fetch";
import { NextResponse, type NextRequest } from "next/server";

// Use import type — erased at compile time, never executed in Edge runtime
import type { Session } from "@repo/auth";

const PUBLIC_PATHS = ["/login", "/register", "/api/auth"];

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Fetch the session from the better-auth endpoint instead of importing
  // the full auth config (which pulls in DB + env validation — not Edge-safe).
  const { data: session } = await betterFetch<Session>("/api/auth/get-session", {
    baseURL: req.nextUrl.origin,
    headers: {
      cookie: req.headers.get("cookie") ?? "",
    },
  });

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
