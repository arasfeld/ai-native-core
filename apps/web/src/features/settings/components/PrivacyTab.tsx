"use client";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useEffect, useState } from "react";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  type CookieConsent,
  readCookieConsent,
  writeCookieConsent,
} from "@/lib/cookie-consent";

export function PrivacyTab() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [consent, setConsent] = useState<CookieConsent | null>(null);

  useEffect(() => {
    setConsent(readCookieConsent());
  }, []);

  async function handleExport() {
    setExportError("");
    setExporting(true);
    try {
      const res = await fetch("/api/auth/export");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? "user-data.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to export data.",
      );
    } finally {
      setExporting(false);
    }
  }

  function setAnalyticsConsent(value: "accepted" | "rejected") {
    const next = writeCookieConsent(value);
    setConsent(next);
    // Force a reload so PostHog picks up the new state on next mount.
    window.location.reload();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Export your data</CardTitle>
          <CardDescription>
            Download a JSON file containing your profile, conversations,
            messages, notifications, audit log, and other personal data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {exportError && (
            <p className="text-destructive text-sm">{exportError}</p>
          )}
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? "Preparing…" : "Download my data"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cookie preferences</CardTitle>
          <CardDescription>
            Strictly necessary cookies (sign-in, security) are always on. Choose
            whether to allow optional product analytics.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Current choice:{" "}
            <strong className="text-foreground">
              {consent === "accepted"
                ? "Analytics allowed"
                : consent === "rejected"
                  ? "Analytics disabled"
                  : "Not set"}
            </strong>
          </p>
          <div className="flex gap-2">
            <Button
              variant={consent === "accepted" ? "default" : "outline"}
              onClick={() => setAnalyticsConsent("accepted")}
            >
              Allow analytics
            </Button>
            <Button
              variant={consent === "rejected" ? "default" : "outline"}
              onClick={() => setAnalyticsConsent("rejected")}
            >
              Disable analytics
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Stored locally as <code>{COOKIE_CONSENT_STORAGE_KEY}</code>; the
            page reloads when you change this so the choice takes effect
            immediately.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
