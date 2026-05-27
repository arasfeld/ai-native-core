"use client";

import { Button } from "@repo/ui/components/button";
import { CheckIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { useState } from "react";

type Rating = 1 | -1;

interface MessageActionsProps {
  runId: string;
  sessionId: string;
}

/**
 * Thumb-up / thumb-down buttons rendered under each assistant message.
 *
 * The `runId` arrives via AI SDK message metadata (set by the chat API route
 * when it sees the leading `{type:"meta", run_id}` SSE event from FastAPI).
 * Without a runId the component renders nothing — feedback without a trace
 * ID isn't useful since it can't be mirrored to LangSmith.
 */
export function MessageActions({
  runId,
  sessionId,
}: MessageActionsProps): React.ReactNode {
  const [submitted, setSubmitted] = useState<Rating | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!runId) return null;

  const submit = async (rating: Rating) => {
    if (submitted !== null || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          rating,
          session_id: sessionId,
        }),
      });
      if (res.ok) setSubmitted(rating);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-1 flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Thumbs up"
        aria-pressed={submitted === 1}
        disabled={submitted !== null}
        onClick={() => submit(1)}
        className="text-muted-foreground hover:text-foreground aria-pressed:text-foreground"
      >
        {submitted === 1 ? <CheckIcon /> : <ThumbsUpIcon />}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Thumbs down"
        aria-pressed={submitted === -1}
        disabled={submitted !== null}
        onClick={() => submit(-1)}
        className="text-muted-foreground hover:text-foreground aria-pressed:text-foreground"
      >
        {submitted === -1 ? <CheckIcon /> : <ThumbsDownIcon />}
      </Button>
    </div>
  );
}
