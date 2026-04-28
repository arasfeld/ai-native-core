"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function EmailVerificationBanner() {
  const { data: session } = authClient.useSession();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  if (!session?.user || session.user.emailVerified) return null;

  async function handleResend() {
    if (!session) return;
    setSending(true);
    await authClient.sendVerificationEmail({
      email: session.user.email,
      callbackURL: "/chat",
    });
    setSent(true);
    setSending(false);
  }

  return (
    <div className="flex items-center justify-between border-amber-200 border-b bg-amber-50 px-4 py-2 text-amber-800 text-sm dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <span>Please verify your email address to access all features.</span>
      <button
        type="button"
        onClick={handleResend}
        disabled={sent || sending}
        className="ml-4 font-medium underline underline-offset-4 disabled:opacity-50"
      >
        {sent
          ? "Email sent!"
          : sending
            ? "Sending…"
            : "Resend verification email"}
      </button>
    </div>
  );
}
