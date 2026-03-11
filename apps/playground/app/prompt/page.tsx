"use client";

import { useCallback, useRef, useState } from "react";
import { Streamdown } from "streamdown";

type Status = "idle" | "running" | "done" | "error";

export default function PromptPage() {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!userMessage.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("running");
    setOutput("");
    setElapsed(null);
    const start = Date.now();

    try {
      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, system_prompt: systemPrompt }),
        signal: controller.signal,
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
          const delta = token === "" ? "\n" : token;
          full += delta;
          setOutput(full);
        }
      }

      setElapsed(Math.round((Date.now() - start) / 100) / 10);
      setStatus("done");
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setOutput("Error: " + String(err));
        setStatus("error");
      }
    }
  }, [userMessage, systemPrompt]);

  const stop = () => {
    abortRef.current?.abort();
    setStatus("idle");
  };

  return (
    <div className="flex h-full flex-col gap-0">
      <div className="border-b px-8 py-5">
        <h1 className="font-semibold text-lg">Prompt Tester</h1>
        <p className="text-muted-foreground text-sm">
          Test prompts against the live AI service with streaming output.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-0">
        {/* Left: inputs */}
        <div className="flex w-96 shrink-0 flex-col gap-4 border-r p-6">
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-sm">System Prompt</label>
            <textarea
              className="min-h-28 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="You are a helpful assistant..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-sm">User Message</label>
            <textarea
              className="min-h-28 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ask anything..."
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            {status === "running" ? (
              <button
                onClick={stop}
                className="flex-1 rounded-md border bg-destructive/10 px-4 py-2 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={run}
                disabled={!userMessage.trim()}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Run
              </button>
            )}
          </div>

          {elapsed !== null && (
            <p className="text-muted-foreground text-xs">{elapsed}s</p>
          )}
        </div>

        {/* Right: output */}
        <div className="flex min-w-0 flex-1 flex-col p-6">
          <div className="mb-3 flex items-center justify-between">
            <label className="font-medium text-sm">Output</label>
            {output && (
              <button
                onClick={() => { setOutput(""); setStatus("idle"); }}
                className="text-muted-foreground text-xs hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-4">
            {status === "running" && !output && (
              <p className="animate-pulse text-muted-foreground text-sm">Thinking...</p>
            )}
            {output ? (
              <Streamdown className="prose prose-sm dark:prose-invert max-w-none">
                {output}
              </Streamdown>
            ) : status === "idle" ? (
              <p className="text-muted-foreground text-sm">Output will appear here.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
