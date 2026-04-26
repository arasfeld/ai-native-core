"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await authClient.forgetPassword({
      email,
      redirectTo: "/reset-password",
    });
    setLoading(false);
    setSubmitted(true);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-semibold text-2xl">Forgot password</h1>
          <p className="text-muted-foreground text-sm">
            Enter your email and we&apos;ll send a reset link
          </p>
        </div>

        {submitted ? (
          <div className="space-y-4 rounded-lg border bg-muted/40 p-5 text-center">
            <p className="font-medium text-sm">Check your email</p>
            <p className="text-muted-foreground text-sm">
              If an account exists for <strong>{email}</strong>, a password
              reset link has been sent.
            </p>
            <Link
              href="/login"
              className="block text-muted-foreground text-sm underline underline-offset-4"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="email" className="font-medium text-sm">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>

            <p className="text-center text-muted-foreground text-sm">
              <Link
                href="/login"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
