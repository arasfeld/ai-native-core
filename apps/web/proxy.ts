export { auth as proxy } from "@/auth";

export const config = {
  // Protect everything except the auth pages and Next.js internals
  matcher: ["/((?!login|register|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
