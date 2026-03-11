import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SidebarNav } from "@/components/sidebar-nav";
import { BrainIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "AI Playground",
  description: "Prompt testing, agent debugging, and RAG experiments",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <div className="flex h-dvh">
            <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/30 p-4">
              <div className="mb-6 flex items-center gap-2">
                <BrainIcon size={18} className="text-primary" />
                <span className="font-semibold text-sm">AI Playground</span>
              </div>
              <SidebarNav />
            </aside>
            <main className="min-w-0 flex-1 overflow-auto">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
