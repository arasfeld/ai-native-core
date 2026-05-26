"use client";

import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { useEffect, useState } from "react";

export function AiTab() {
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setInstructions(d.system_instructions))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/preferences", {
      method: "PUT",
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
    <div className="space-y-6">
      <div>
        <h2 className="font-medium text-lg">AI Settings</h2>
        <p className="text-muted-foreground text-sm">
          Customize how the AI responds across all your conversations.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="global-instructions">Global system instructions</Label>
        <p className="text-muted-foreground text-sm">
          These instructions are prepended to every conversation. Use them to
          set your preferred language, tone, or any standing context.
        </p>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <Textarea
            id="global-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Always reply in French. Be concise."
            rows={6}
            className="resize-y"
          />
        )}
      </div>

      <Button onClick={handleSave} disabled={saving || loading}>
        {saving ? "Saving…" : saved ? "Saved!" : "Save"}
      </Button>
    </div>
  );
}
