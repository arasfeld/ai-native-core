"use client";

import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as Provider } from "posthog-js/react";
import { type ReactNode, Suspense, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { hasAcceptedAnalytics } from "@/lib/cookie-consent";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

if (
  typeof window !== "undefined" &&
  KEY &&
  !posthog.__loaded &&
  hasAcceptedAnalytics()
) {
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: "identified_only",
    persistence: "localStorage+cookie",
  });
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || !posthog.__loaded) return;
    let url = `${window.location.origin}${pathname}`;
    const qs = searchParams?.toString();
    if (qs) url = `${url}?${qs}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

function PostHogIdentify() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const userId = user?.id;
  const email = user?.email;
  const name = user?.name;

  useEffect(() => {
    if (!posthog.__loaded) return;
    if (userId) {
      posthog.identify(userId, {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      });
    } else {
      posthog.reset();
    }
  }, [userId, email, name]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  if (!KEY) return <>{children}</>;
  return (
    <Provider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogIdentify />
      {children}
    </Provider>
  );
}
