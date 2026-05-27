"use client";

import { Button } from "@repo/ui/components/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  type CookieConsent,
  readCookieConsent,
  writeCookieConsent,
} from "@/lib/cookie-consent";

export function CookieConsentBanner() {
  const [consent, setConsent] = useState<CookieConsent | null | "loading">(
    "loading",
  );

  useEffect(() => {
    setConsent(readCookieConsent());
  }, []);

  function handleChoice(value: CookieConsent) {
    writeCookieConsent(value);
    setConsent(value);
    if (value === "accepted") {
      // Reload so PostHog initializes on next mount.
      window.location.reload();
    }
  }

  if (consent === "loading" || consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          We use strictly necessary cookies to keep you signed in. With your
          permission, we also use optional analytics cookies to understand how
          the product is used. See our{" "}
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleChoice("rejected")}
          >
            Reject optional
          </Button>
          <Button size="sm" onClick={() => handleChoice("accepted")}>
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
