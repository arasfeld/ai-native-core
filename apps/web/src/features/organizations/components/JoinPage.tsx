"use client";

import { Button } from "@repo/ui/components/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

type JoinInfo = {
  org_name: string;
  org_id: string;
  role: string;
};

export function JoinPage({ token }: { token: string }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetch(`/api/organizations/join/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setInfo)
      .catch(() => setError("This invite link is invalid or has expired."));
  }, [token]);

  async function accept() {
    if (!session) {
      router.push(`/login?redirect=/join/${token}`);
      return;
    }
    setJoining(true);
    const res = await fetch(`/api/organizations/join/${token}`, {
      method: "POST",
    });
    if (res.ok) {
      const data = await res.json();
      // Plain document.cookie write — see OrgSwitcher.tsx for rationale.
      // biome-ignore lint/suspicious/noDocumentCookie: middleware-readable cookie
      document.cookie = `active_org_id=${data.org_id}; path=/; max-age=31536000; SameSite=Lax`;
      router.push("/");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.detail ?? "Failed to join organization.");
      setJoining(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm space-y-4 rounded-lg border p-6 text-center">
          <p className="font-semibold text-destructive">{error}</p>
          <Button variant="outline" onClick={() => router.push("/")}>
            Go home
          </Button>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm space-y-4 rounded-lg border p-6 text-center">
        <h1 className="font-semibold text-xl">Join {info.org_name}</h1>
        <p className="text-muted-foreground text-sm">
          You&apos;ve been invited to join{" "}
          <span className="font-medium text-foreground">{info.org_name}</span>{" "}
          as a <span className="font-medium text-foreground">{info.role}</span>.
        </p>
        <Button className="w-full" onClick={accept} disabled={joining}>
          {joining
            ? "Joining…"
            : session
              ? "Accept Invitation"
              : "Sign in to accept"}
        </Button>
      </div>
    </div>
  );
}
