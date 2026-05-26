import {
  ArrowRightIcon,
  BotIcon,
  ShieldIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";

const FEATURES = [
  {
    icon: BotIcon,
    title: "AI-Native from Day One",
    description:
      "LangGraph agents, streaming responses, RAG retrieval, and tool calling — all wired up and ready to extend.",
  },
  {
    icon: ZapIcon,
    title: "Streaming-First Architecture",
    description:
      "Every chat response streams via SSE. Vercel AI SDK on the frontend, FastAPI on the backend.",
  },
  {
    icon: ShieldIcon,
    title: "Auth + Multi-Tenancy",
    description:
      "better-auth handles sign-up/sign-in. Every user gets a tenant with a monthly token budget out of the box.",
  },
  {
    icon: UsersIcon,
    title: "Guest Mode Included",
    description:
      "Visitors can try the chat without signing up, rate-limited by IP. Converts to a full account in one click.",
  },
];

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <BotIcon className="size-4 text-muted-foreground" />
          AI Native Core
        </div>
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

      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-20 text-center">
        <div className="max-w-2xl space-y-4">
          <h1 className="font-bold text-4xl tracking-tight sm:text-5xl">
            The AI-Native SaaS Starter
          </h1>
          <p className="text-lg text-muted-foreground">
            A production-ready monorepo template with LangGraph agents,
            streaming chat, RAG, multi-tenancy, and billing — so you can ship
            your idea, not the infrastructure.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/chat"
            className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground text-sm hover:bg-primary/90"
          >
            Try for free (no sign-up)
            <ArrowRightIcon className="size-4" />
          </Link>
          <Link
            href="/register"
            className="rounded-md border px-5 py-2.5 font-medium text-sm hover:bg-accent"
          >
            Create an account
          </Link>
        </div>

        <div className="mt-6 grid w-full max-w-4xl gap-4 text-left sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="space-y-2 rounded-lg border bg-card p-5"
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t px-6 py-4 text-center text-muted-foreground text-xs">
        AI Native Core — open-source monorepo template
      </footer>
    </div>
  );
}
