"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import {
  FileText,
  Globe,
  Link as LinkIcon,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type DocumentRow = {
  id: string;
  name: string;
  mime_type: string | null;
  source_url: string | null;
  size_bytes: number | null;
  status: "processing" | "ready" | "failed";
  error_message: string | null;
  chunks_count: number;
  created_at: string;
  updated_at: string;
};

const POLL_INTERVAL_MS = 4000;

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(s: string): string {
  return new Date(s).toLocaleString();
}

function StatusBadge({ status }: { status: DocumentRow["status"] }) {
  if (status === "ready") {
    return (
      <Badge
        variant="secondary"
        className="bg-green-500/15 text-green-700 dark:text-green-400"
      >
        Ready
      </Badge>
    );
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return (
    <Badge
      variant="secondary"
      className="bg-blue-500/15 text-blue-700 dark:text-blue-400"
    >
      Processing…
    </Badge>
  );
}

export function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [submittingUrl, setSubmittingUrl] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchDocs = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) setDocs(await res.json());
  }, []);

  useEffect(() => {
    fetchDocs().finally(() => setLoading(false));
  }, [fetchDocs]);

  // Poll while any document is still processing.
  useEffect(() => {
    const hasProcessing = docs.some((d) => d.status === "processing");
    if (!hasProcessing) return;
    const t = setInterval(fetchDocs, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [docs, fetchDocs]);

  async function uploadFiles(files: FileList | File[]) {
    setUploadError(null);
    setUploading(true);
    try {
      const list = Array.from(files);
      for (const file of list) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/documents", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          let detail = `Upload failed (${res.status})`;
          try {
            const body = await res.json();
            if (body?.detail) detail = body.detail;
          } catch {
            // ignore
          }
          setUploadError(detail);
          break;
        }
        const created: DocumentRow = await res.json();
        setDocs((prev) => [created, ...prev]);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = urlValue.trim();
    if (!trimmed) return;
    setSubmittingUrl(true);
    try {
      const res = await fetch("/api/documents/url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      if (res.ok) {
        const created: DocumentRow = await res.json();
        setDocs((prev) => [created, ...prev]);
        setUrlValue("");
      } else {
        let detail = `Request failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.detail) detail = body.detail;
        } catch {
          // ignore
        }
        setUploadError(detail);
      }
    } finally {
      setSubmittingUrl(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${deleteId}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        setDocs((prev) => prev.filter((d) => d.id !== deleteId));
        setDeleteId(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  const pendingDelete = deleteId ? docs.find((d) => d.id === deleteId) : null;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Knowledge</h1>
        <p className="text-muted-foreground text-sm">
          Upload documents or paste URLs to make them searchable in chat. Text,
          Markdown, and JSON files are supported (up to 5 MB).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add documents</CardTitle>
          <CardDescription>
            Drop files here or import a web page by URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section
            aria-label="File drop zone"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length)
                uploadFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
          >
            <Upload className="mb-2 size-8 text-muted-foreground" />
            <p className="text-sm">
              Drag and drop files here, or{" "}
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                browse
              </button>
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              .txt, .md, .json — 5 MB max
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept=".txt,.md,.markdown,.json,text/*"
              onChange={(e) => {
                if (e.target.files?.length) uploadFiles(e.target.files);
              }}
            />
          </section>

          <form onSubmit={submitUrl} className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                type="url"
                placeholder="https://example.com/article"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                disabled={submittingUrl}
              />
            </div>
            <Button type="submit" disabled={submittingUrl || !urlValue.trim()}>
              {submittingUrl ? "Adding…" : "Add URL"}
            </Button>
          </form>

          {uploadError && (
            <p className="text-destructive text-sm" role="alert">
              {uploadError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            {loading
              ? "Loading…"
              : docs.length === 0
                ? "No documents yet. Upload one above to get started."
                : `${docs.length} ${docs.length === 1 ? "document" : "documents"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {docs.length > 0 && (
            <ul className="divide-y">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 py-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    {doc.source_url ? (
                      <Globe className="size-4 text-muted-foreground" />
                    ) : (
                      <FileText className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-sm">{doc.name}</p>
                      <StatusBadge status={doc.status} />
                    </div>
                    <p className="truncate text-muted-foreground text-xs">
                      {doc.status === "ready"
                        ? `${doc.chunks_count} chunks · ${formatBytes(doc.size_bytes)} · ${formatDate(doc.created_at)}`
                        : doc.status === "failed"
                          ? (doc.error_message ?? "Ingestion failed")
                          : `Added ${formatDate(doc.created_at)}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${doc.name}`}
                    onClick={() => setDeleteId(doc.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `"${pendingDelete.name}" and its ${pendingDelete.chunks_count} embedded chunks will be removed. This can't be undone.`
                : "This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
