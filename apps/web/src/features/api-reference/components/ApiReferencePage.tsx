"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ApiReferencePage() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-muted-foreground text-sm">
        Loading API reference…
      </div>
    );
  }

  return (
    <ApiReferenceReact
      configuration={{
        url: "/api/openapi",
        darkMode: resolvedTheme === "dark",
        hideClientButton: false,
        hideDownloadButton: false,
        metaData: {
          title: "AI Native Core — API Reference",
        },
      }}
    />
  );
}
