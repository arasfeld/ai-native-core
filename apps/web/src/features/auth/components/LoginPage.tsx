"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { OAuthButtons } from "./OAuthButtons";

type LoginStep = "credentials" | "totp";

export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<LoginStep>("credentials");
  const [totpCode, setTotpCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error: authError } = await authClient.signIn.email({
      email,
      password,
    });
    setLoading(false);
    // better-auth signals 2FA required either via error code or a redirect flag
    const needs2FA =
      (authError as { code?: string } | null)?.code === "TWO_FACTOR_REQUIRED" ||
      (data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect;
    if (needs2FA) {
      setStep("totp");
      return;
    }
    if (authError) {
      setError("Invalid email or password.");
    } else {
      router.push("/chat");
    }
  }

  async function handleVerifyTotp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: authError } = await authClient.twoFactor.verifyTotp({
      code: totpCode,
    });
    setLoading(false);
    if (authError) {
      setError("Invalid code. Please try again.");
    } else {
      router.push("/chat");
    }
  }

  if (step === "totp") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 text-center">
            <h1 className="font-semibold text-2xl">
              Two-factor authentication
            </h1>
            <p className="text-muted-foreground text-sm">
              {useBackupCode
                ? "Enter one of your backup codes."
                : "Enter the 6-digit code from your authenticator app."}
            </p>
          </div>

          <form onSubmit={handleVerifyTotp} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="totp-code" className="font-medium text-sm">
                {useBackupCode ? "Backup code" : "Authentication code"}
              </label>
              <input
                id="totp-code"
                type="text"
                inputMode={useBackupCode ? "text" : "numeric"}
                maxLength={useBackupCode ? 20 : 6}
                autoComplete="one-time-code"
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder={useBackupCode ? "XXXX-XXXX" : "123456"}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !totpCode}
              className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setUseBackupCode((b) => !b);
              setTotpCode("");
              setError("");
            }}
            className="w-full text-center text-muted-foreground text-sm underline underline-offset-4"
          >
            {useBackupCode
              ? "Use authenticator app instead"
              : "Use backup code instead"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-semibold text-2xl">Sign in</h1>
          <p className="text-muted-foreground text-sm">
            Enter your credentials to continue
          </p>
        </div>

        <OAuthButtons />

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-muted-foreground text-xs">
            or continue with email
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

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

          <div className="space-y-1">
            <label htmlFor="password" className="font-medium text-sm">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="text-right">
              <Link
                href="/forgot-password"
                className="text-muted-foreground text-xs underline underline-offset-4"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-muted-foreground text-sm">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
