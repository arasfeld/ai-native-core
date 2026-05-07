"use client";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Step = "idle-disabled" | "setup" | "backup-codes" | "idle-enabled";

export function SecurityTab() {
  const { data: session } = authClient.useSession();
  const [step, setStep] = useState<Step>("idle-disabled");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [rawSecret, setRawSecret] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session?.user) {
      // twoFactorEnabled is added to the user type by twoFactorClient()
      const enabled = (session.user as { twoFactorEnabled?: boolean })
        .twoFactorEnabled;
      setStep(enabled ? "idle-enabled" : "idle-disabled");
    }
  }, [session]);

  async function handleStartSetup() {
    setError("");
    setLoading(true);
    const { data, error: err } = await authClient.twoFactor.getTotpUri({
      password,
    });
    setLoading(false);
    if (err || !data) {
      setError(err?.message ?? "Failed to start 2FA setup.");
      return;
    }
    const uri = (data as { totpURI: string }).totpURI;
    const match = uri.match(/secret=([^&]+)/);
    setRawSecret(match?.[1] ?? "");
    setQrDataUrl(await QRCode.toDataURL(uri));
    setPassword("");
    setStep("setup");
  }

  async function handleEnable() {
    setError("");
    setLoading(true);
    const { data, error: err } = await authClient.twoFactor.enable({
      password,
      totpCode,
    });
    setLoading(false);
    if (err || !data) {
      setError(err?.message ?? "Invalid code. Please try again.");
      return;
    }
    setBackupCodes((data as { backupCodes: string[] }).backupCodes);
    setPassword("");
    setTotpCode("");
    setStep("backup-codes");
  }

  async function handleDisable() {
    setError("");
    setLoading(true);
    const { error: err } = await authClient.twoFactor.disable({ password });
    setLoading(false);
    if (err) {
      setError(err.message ?? "Failed to disable 2FA.");
      return;
    }
    setPassword("");
    setStep("idle-disabled");
  }

  async function handleRegenerateBackupCodes() {
    setError("");
    setLoading(true);
    const { data, error: err } =
      await authClient.twoFactor.generateBackupCodes();
    setLoading(false);
    if (err || !data) {
      setError(err?.message ?? "Failed to regenerate backup codes.");
      return;
    }
    setBackupCodes((data as { backupCodes: string[] }).backupCodes);
    setStep("backup-codes");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Add an extra layer of security using an authenticator app (e.g.
            Google Authenticator, Authy).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "idle-disabled" && (
            <>
              <p className="text-muted-foreground text-sm">
                2FA is not enabled. Enter your current password to begin setup.
              </p>
              <div className="space-y-1">
                <label htmlFor="2fa-password" className="font-medium text-sm">
                  Current password
                </label>
                <Input
                  id="2fa-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your current password"
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button
                onClick={handleStartSetup}
                disabled={loading || !password}
              >
                {loading ? "Loading…" : "Enable 2FA"}
              </Button>
            </>
          )}

          {step === "setup" && (
            <>
              <p className="text-muted-foreground text-sm">
                Scan this QR code with your authenticator app, then enter the
                6-digit code it shows to confirm.
              </p>
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="TOTP QR code"
                  className="rounded-md"
                  width={200}
                  height={200}
                />
              )}
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">
                  Can&apos;t scan? Enter this secret manually in your app:
                </p>
                <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-sm">
                  {rawSecret}
                </code>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="totp-confirm-code"
                  className="font-medium text-sm"
                >
                  6-digit code from app
                </label>
                <Input
                  id="totp-confirm-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="2fa-password-confirm"
                  className="font-medium text-sm"
                >
                  Current password
                </label>
                <Input
                  id="2fa-password-confirm"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your current password"
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <div className="flex gap-2">
                <Button
                  onClick={handleEnable}
                  disabled={loading || totpCode.length !== 6 || !password}
                >
                  {loading ? "Verifying…" : "Confirm & enable"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("idle-disabled");
                    setError("");
                    setTotpCode("");
                    setPassword("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}

          {step === "backup-codes" && (
            <>
              <p className="text-sm">
                <strong>Save these backup codes somewhere safe.</strong> Each
                can be used once to sign in if you lose your authenticator app.
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-4 font-mono">
                {backupCodes.map((code) => (
                  <span key={code} className="text-sm">
                    {code}
                  </span>
                ))}
              </div>
              <Button onClick={() => setStep("idle-enabled")}>Done</Button>
            </>
          )}

          {step === "idle-enabled" && (
            <>
              <p className="text-sm text-green-600 dark:text-green-400">
                Two-factor authentication is active on your account.
              </p>
              <div className="space-y-1">
                <label
                  htmlFor="2fa-disable-password"
                  className="font-medium text-sm"
                >
                  Current password
                </label>
                <Input
                  id="2fa-disable-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Required to disable or regenerate codes"
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleRegenerateBackupCodes}
                  disabled={loading}
                >
                  {loading ? "Loading…" : "Regenerate backup codes"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDisable}
                  disabled={loading || !password}
                >
                  {loading ? "Disabling…" : "Disable 2FA"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
