"use client";

import { Button } from "@repo/ui/components/button";
import { Textarea } from "@repo/ui/components/textarea";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

export function ConversationInstructions({
  conversationId,
  initialInstructions = "",
}: {
  conversationId: string;
  initialInstructions?: string;
}) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState(initialInstructions);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system_instructions: instructions }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  return (
    <div className="border-b px-4 py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
      >
        {open ? (
          <ChevronDownIcon className="h-3 w-3" />
        ) : (
          <ChevronRightIcon className="h-3 w-3" />
        )}
        System instructions
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Instructions for this conversation only…"
            rows={3}
            className="resize-y text-sm"
          />
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : saved ? "Saved!" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
