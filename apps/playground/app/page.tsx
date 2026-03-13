import { DatabaseIcon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";

const tools = [
  {
    href: "/prompt",
    icon: MessageSquareIcon,
    title: "Prompt Tester",
    description:
      "Write a system prompt and user message, then run it against the live API with streaming output.",
  },
  {
    href: "/rag",
    icon: DatabaseIcon,
    title: "RAG Lab",
    description:
      "Ingest content into the vector store, then test retrieval-augmented queries against it.",
  },
];

export default function DashboardPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-bold text-2xl">Developer Playground</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Tools for testing prompts, debugging agents, and experimenting with
          RAG.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tools.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-lg border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon size={20} />
            </div>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-muted-foreground text-sm">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
