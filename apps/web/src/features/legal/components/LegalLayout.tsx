import { BotIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  lastUpdated: string;
  children: ReactNode;
};

export function LegalLayout({ title, lastUpdated, children }: Props) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-sm"
        >
          <BotIcon className="size-4 text-muted-foreground" />
          AI Native Core
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-muted-foreground text-sm hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm hover:bg-primary/90"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <div className="mb-10 space-y-2">
          <h1 className="font-bold text-3xl tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="text-muted-foreground text-sm">
            Last updated: {lastUpdated}
          </p>
        </div>

        <article className="prose prose-neutral dark:prose-invert prose-h2:mt-10 max-w-none prose-headings:font-semibold prose-a:text-foreground prose-h2:text-xl prose-p:leading-relaxed prose-headings:tracking-tight">
          {children}
        </article>
      </main>

      <footer className="border-t px-6 py-4 text-center text-muted-foreground text-xs">
        <div className="flex items-center justify-center gap-4">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
