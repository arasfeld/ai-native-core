import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const trimmed = code.trim().slice(0, 32);
  if (trimmed) {
    const jar = await cookies();
    jar.set("pending_referral_code", trimmed, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
      sameSite: "lax",
      httpOnly: false, // readable by the register page on the client
    });
  }
  redirect("/register");
}
