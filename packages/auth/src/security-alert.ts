import { authSchema, db } from "@repo/db";
import { renderSecurityAlertEmail, sendEmail } from "@repo/emails";
import { and, eq, ne, sql } from "drizzle-orm";

type SessionRow = {
  id: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const BROWSER_PATTERNS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Chrome\//, "Chrome"],
  [/Firefox\//, "Firefox"],
  [/Safari\//, "Safari"],
];

const OS_PATTERNS: [RegExp, string][] = [
  [/Windows NT/i, "Windows"],
  [/Mac OS X|Macintosh/i, "macOS"],
  [/iPhone|iPad|iOS/i, "iOS"],
  [/Android/i, "Android"],
  [/Linux/i, "Linux"],
];

export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  const browser = BROWSER_PATTERNS.find(([re]) => re.test(userAgent))?.[1];
  const os = OS_PATTERNS.find(([re]) => re.test(userAgent))?.[1];
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

/**
 * Send a security alert (email + in-app notification) when a session is
 * created from an IP the user has never used before. The very first session
 * for a user is treated as recognized so signup doesn't trigger an alert.
 */
export async function maybeAlertOnNewLogin(
  session: SessionRow,
  appUrl: string,
): Promise<void> {
  const { userId, id: newSessionId, ipAddress, userAgent } = session;
  if (!userId) return;

  try {
    const priors = await db
      .select({ ipAddress: authSchema.session.ipAddress })
      .from(authSchema.session)
      .where(
        and(
          eq(authSchema.session.userId, userId),
          ne(authSchema.session.id, newSessionId),
        ),
      );

    if (priors.length === 0) return;

    const knownIps = new Set(
      priors.map((row) => row.ipAddress).filter((ip): ip is string => !!ip),
    );
    if (ipAddress && knownIps.has(ipAddress)) return;

    const userRow = await db
      .select({ email: authSchema.user.email, name: authSchema.user.name })
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId))
      .limit(1);
    if (userRow.length === 0) return;

    const { email, name } = userRow[0];
    const device = describeDevice(userAgent);
    const ip = ipAddress ?? "unknown";
    const loginAt = new Date().toUTCString();
    const securityUrl = `${appUrl}/settings?tab=profile`;

    const title = "New sign-in to your account";
    const body = `Signed in from ${device} (${ip}) at ${loginAt}. If this wasn't you, review your active sessions.`;

    await db.execute(
      sql`INSERT INTO notifications (user_id, type, title, body) VALUES (${userId}, ${"security_alert"}, ${title}, ${body})`,
    );

    const html = await renderSecurityAlertEmail({
      name: name ?? undefined,
      device,
      ipAddress: ip,
      loginAt,
      securityUrl,
    });
    await sendEmail(email, title, html);
  } catch {
    // Never throw from an auth hook — security alerts are best-effort.
  }
}
