export type CookieConsent = "accepted" | "rejected";

export const COOKIE_CONSENT_STORAGE_KEY = "cookie-consent";

export function readCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
  return value === "accepted" || value === "rejected" ? value : null;
}

export function writeCookieConsent(value: CookieConsent): CookieConsent {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, value);
  }
  return value;
}

export function hasAcceptedAnalytics(): boolean {
  return readCookieConsent() === "accepted";
}
