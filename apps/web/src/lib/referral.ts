/**
 * Referral handoff between the public landing pages and the post-signup flow.
 *
 * `/r/[code]` drops a cookie (`pending_referral_code`) so the code survives an
 * OAuth round-trip. After auth completes we POST it to `/api/referrals/accept`
 * and clear the cookie so it isn't applied twice.
 */

const COOKIE = "pending_referral_code";

export function readPendingReferralCode(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${COOKIE}=`;
  const found = document.cookie.split("; ").find((c) => c.startsWith(prefix));
  if (!found) return null;
  const value = decodeURIComponent(found.slice(prefix.length));
  return value || null;
}

function clearPendingReferralCode() {
  if (typeof document === "undefined") return;
  // biome-ignore lint/suspicious/noDocumentCookie: simple clear; Cookie Store API isn't universally available
  document.cookie = `${COOKIE}=; Max-Age=0; path=/`;
}

export async function applyPendingReferral(): Promise<boolean> {
  const code = readPendingReferralCode();
  if (!code) return false;
  try {
    const res = await fetch("/api/referrals/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    // Always clear the cookie — a stale code shouldn't keep re-firing.
    clearPendingReferralCode();
    return res.ok;
  } catch {
    clearPendingReferralCode();
    return false;
  }
}
