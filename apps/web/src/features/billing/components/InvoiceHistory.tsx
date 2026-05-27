"use client";

import { useEffect, useState } from "react";

type Invoice = {
  id: string;
  number: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string | null;
  created: number;
  period_start: number;
  period_end: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
};

type InvoiceList = {
  invoices: Invoice[];
  has_more: boolean;
};

function formatAmount(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusClass(status: string | null) {
  switch (status) {
    case "paid":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "open":
    case "uncollectible":
      return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
    case "void":
    case "draft":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function InvoiceHistory() {
  const [data, setData] = useState<InvoiceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/billing/invoices")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setError("Failed to load invoices."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-lg">Invoice history</h2>
        <p className="text-muted-foreground text-sm">
          Past invoices from Stripe. Click View to open the hosted receipt, or
          download the PDF.
        </p>
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">Loading invoices…</p>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}

      {data && data.invoices.length === 0 && !loading && !error && (
        <div className="rounded-xl border p-6 text-muted-foreground text-sm">
          No invoices yet. Once you upgrade to Pro, your monthly invoices will
          appear here.
        </div>
      )}

      {data && data.invoices.length > 0 && (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-left font-medium">Number</th>
                <th className="px-4 py-2 text-left font-medium">Amount</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 align-middle">
                    {formatDate(inv.created)}
                  </td>
                  <td className="px-4 py-3 align-middle font-mono text-muted-foreground text-xs">
                    {inv.number ?? "—"}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {formatAmount(
                      inv.amount_paid > 0 ? inv.amount_paid : inv.amount_due,
                      inv.currency,
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium text-xs capitalize ${statusClass(inv.status)}`}
                    >
                      {inv.status ?? "unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right align-middle">
                    <div className="inline-flex gap-3">
                      {inv.hosted_invoice_url && (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary text-xs underline underline-offset-4 hover:no-underline"
                        >
                          View
                        </a>
                      )}
                      {inv.invoice_pdf && (
                        <a
                          href={inv.invoice_pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary text-xs underline underline-offset-4 hover:no-underline"
                        >
                          PDF
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
