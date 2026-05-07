# 2FA / TOTP Design

**Goal:** Add authenticator-app TOTP and backup codes to the existing better-auth setup. Users enroll via a new Security settings tab; the login page challenges for a code when 2FA is active.

**Tech Stack:** better-auth v1.5.5 `twoFactor` plugin, Drizzle ORM (PostgreSQL), Next.js App Router, React, `qrcode` npm package

---

## DB Schema

Two additions to `packages/db/src/schema/auth.ts` (Drizzle):

### New table: `twoFactor`

```ts
export const twoFactor = pgTable("twoFactor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backupCodes").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
```

### New column on `session`

```ts
twoFactorVerified: boolean("twoFactorVerified").default(false).notNull(),
```

### Migration: `packages/db/migrations/0008_two_factor.sql`

```sql
CREATE TABLE IF NOT EXISTS "twoFactor" (
  id            TEXT    PRIMARY KEY,
  secret        TEXT    NOT NULL,
  "backupCodes" TEXT    NOT NULL,
  "userId"      TEXT    NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

ALTER TABLE session
  ADD COLUMN IF NOT EXISTS "twoFactorVerified" BOOLEAN NOT NULL DEFAULT FALSE;
```

---

## Auth Plugin Setup

### `packages/auth/src/index.ts`

Add `twoFactor()` to the `plugins` array:

```ts
import { twoFactor } from "better-auth/plugins";

export const auth = betterAuth({
  // ...existing config...
  plugins: [
    expo(),
    twoFactor({
      issuer: "AI Native Core",
      otpOptions: { period: 30, digits: 6 },
    }),
  ],
});
```

### `apps/web/src/lib/auth-client.ts`

Add `twoFactorClient()`:

```ts
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  plugins: [twoFactorClient()],
});
```

This adds typed methods: `authClient.twoFactor.getTotpUri()`, `authClient.twoFactor.enable()`, `authClient.twoFactor.disable()`, `authClient.twoFactor.verifyTotp()`, `authClient.twoFactor.generateBackupCodes()`.

---

## Settings UI — Security Tab

### New file: `apps/web/src/features/settings/components/SecurityTab.tsx`

Client component. Four UI states managed with local `step` state:

| Step | Description |
|------|-------------|
| `idle-disabled` | 2FA is off. Shows "Enable 2FA" button. |
| `setup` | QR code + raw secret + 6-digit confirmation input. |
| `backup-codes` | Displays 10 backup codes once after enabling. |
| `idle-enabled` | 2FA is on. Shows "Regenerate backup codes" + "Disable 2FA" (requires password). |

**Enable flow:**
1. User clicks "Enable 2FA" → call `authClient.twoFactor.getTotpUri()` to get provisioning URI.
2. Render QR code with `qrcode` (`await QRCode.toDataURL(uri)`) + raw secret for manual entry.
3. User scans and enters 6-digit code + current password → call `authClient.twoFactor.enable({ password, totpCode })`.
4. On success → the response includes `backupCodes: string[]`; transition to `backup-codes` step and display them.
5. "Done" → transition to `idle-enabled`.

**Disable flow:**
- User enters current password → call `authClient.twoFactor.disable({ password })`.
- On success → transition to `idle-disabled`.

**Regenerate backup codes:**
- Call `authClient.twoFactor.generateBackupCodes()` → display new codes in the same backup-codes UI state.

### Modified: `apps/web/src/features/settings/components/SettingsPage.tsx`

Add `"security"` to `VALID_TABS`, a `<TabsTrigger value="security">Security</TabsTrigger>`, and:

```tsx
<TabsContent value="security" className="mt-6">
  <SecurityTab />
</TabsContent>
```

Import `SecurityTab` from `./SecurityTab`.

---

## Login Challenge Flow

### Modified: `apps/web/src/features/auth/components/LoginPage.tsx`

Add local state `step: "credentials" | "totp"` and `useBackupCode: boolean`.

**After `authClient.signIn.email()` returns:**
- If response has `twoFactorRedirect: true` → set `step = "totp"`.
- Otherwise handle success/error as today.

**TOTP step renders:**
- A heading "Two-factor authentication"
- A description "Enter the 6-digit code from your authenticator app."
- A single controlled text input (`maxLength={6}`, `inputMode="numeric"`)
- A "Use backup code instead" toggle that flips `useBackupCode` and changes the input to a wider text field with placeholder "XXXX-XXXX"
- A "Verify" button → calls `authClient.twoFactor.verifyTotp({ code })` (better-auth distinguishes TOTP vs backup code automatically via the same endpoint)
- On success → `router.push("/chat")`
- On error → show "Invalid code. Please try again."

---

## Dependencies

Add `qrcode` and its types to `apps/web`:

```bash
pnpm --filter web add qrcode
pnpm --filter web add -D @types/qrcode
```

---

## Verification

Manual testing checklist:

1. Enable 2FA in Settings → QR code renders, authenticator app (e.g. Google Authenticator) accepts it
2. Sign out and sign back in → TOTP challenge step appears after entering email/password
3. Enter correct TOTP code → redirects to `/chat`
4. Enter wrong code → error message shown, no redirect
5. Toggle "Use backup code" → wider input, enter a backup code → redirects to `/chat`; confirm that code cannot be reused
6. Disable 2FA in Settings → sign-in no longer shows TOTP step
7. Regenerate backup codes → new codes displayed, old ones invalidated
