"use client";

import { useState } from "react";
import { Streamdown } from "streamdown";

type IngestStatus = "idle" | "ingesting" | "done" | "error";
type QueryStatus = "idle" | "running" | "done" | "error";

export default function RagPage() {
  const [content, setContent] = useState("");
  const [ingestStatus, setIngestStatus] = useState<IngestStatus>("idle");
  const [chunksStored, setChunksStored] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [queryOutput, setQueryOutput] = useState("");
  const [queryStatus, setQueryStatus] = useState<QueryStatus>("idle");

  const ingest = async () => {
    if (!content.trim()) return;
    setIngestStatus("ingesting");
    setChunksStored(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      setChunksStored(data.chunks_stored);
      setIngestStatus("done");
    } catch {
      setIngestStatus("error");
    }
  };

  const runQuery = async () => {
    if (!query.trim()) return;
    setQueryStatus("running");
    setQueryOutput("");

    try {
      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query, use_rag: true }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const match = part.match(/^data: (.*)/m);
          if (!match) continue;
          const token = match[1] ?? "";
          if (token === "[DONE]") continue;
          full += token === "" ? "\n" : token;
          setQueryOutput(full);
        }
      }
      setQueryStatus("done");
    } catch {
      setQueryStatus("error");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-8 py-5">
        <h1 className="font-semibold text-lg">RAG Lab</h1>
        <p className="text-muted-foreground text-sm">
          Ingest content into the vector store, then query it with
          retrieval-augmented generation.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-0">
        {/* Ingest panel */}
        <div className="flex w-96 shrink-0 flex-col gap-4 border-r p-6">
          <h2 className="font-medium text-sm">1. Ingest Content</h2>

          <textarea
            className="min-h-48 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Paste text content to index..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />

          <button
            type="button"
            onClick={ingest}
            disabled={!content.trim() || ingestStatus === "ingesting"}
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {ingestStatus === "ingesting" ? "Ingesting..." : "Ingest"}
          </button>

          {ingestStatus === "done" && chunksStored !== null && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-green-700 text-sm dark:bg-green-950 dark:text-green-300">
              ✓ Stored {chunksStored} chunk{chunksStored !== 1 ? "s" : ""}
            </p>
          )}
          {ingestStatus === "error" && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-red-700 text-sm dark:bg-red-950 dark:text-red-300">
              Failed to ingest. Is the API running?
            </p>
          )}
        </div>

        {/* Query panel */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          <h2 className="font-medium text-sm">2. Query with RAG</h2>

          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ask something about the ingested content..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runQuery()}
            />
            <button
              type="button"
              onClick={runQuery}
              disabled={!query.trim() || queryStatus === "running"}
              className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {queryStatus === "running" ? "Running..." : "Query"}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-4">
            {queryStatus === "running" && !queryOutput && (
              <p className="animate-pulse text-muted-foreground text-sm">
                Retrieving and generating...
              </p>
            )}
            {queryOutput ? (
              <Streamdown className="prose prose-sm dark:prose-invert max-w-none">
                {queryOutput}
              </Streamdown>
            ) : queryStatus === "idle" ? (
              <p className="text-muted-foreground text-sm">
                Query results will appear here.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
