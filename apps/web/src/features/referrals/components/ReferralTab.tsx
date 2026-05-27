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
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

type ReferralInfo = {
  code: string;
  url: string;
  accepted_count: number;
  bonus_tokens: number;
};

export function ReferralTab() {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/referrals/me");
      if (!cancelled && res.ok) setInfo(await res.json());
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyLink() {
    if (!info) return;
    await navigator.clipboard.writeText(info.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite friends, earn tokens</CardTitle>
          <CardDescription>
            Share your link below. When someone signs up using it, you each get{" "}
            <strong className="text-foreground">
              {info ? info.bonus_tokens.toLocaleString() : "—"} bonus tokens
            </strong>{" "}
            added to your monthly limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading || !info ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  value={info.url}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={copyLink}
                  aria-label="Copy referral link"
                >
                  {copied ? (
                    <>
                      <Check className="size-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-muted-foreground text-sm">
                <strong className="text-foreground">
                  {info.accepted_count}
                </strong>{" "}
                {info.accepted_count === 1 ? "person has" : "people have"}{" "}
                signed up with your link.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
