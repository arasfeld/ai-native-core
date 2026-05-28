# Phase 23 — Mobile Parity (Design)

**Date:** 2026-05-27
**Status:** Approved for planning
**Roadmap items:** #112–#117 + auth UI (predecessor)

## Goal

Bring `apps/mobile` from its current minimal state (chat + bare settings, guest-only) to feature parity with web on the core signed-in surface area. Add mobile-native capabilities (image attachment, voice I/O, push notifications) that complete the multi-modal experience.

## Current state

The mobile app today:

- Two screens: a chat screen (`@ai-sdk/react` + `useChat`) and a settings screen that shows the user's email and a sign-out button.
- **No sign-in or sign-up UI** — users cannot authenticate from inside the app. The chat screen relies on guest mode (the server's `guest:{ip}` identity).
- No conversation history, no profile editor, no preferences UI, no image attachment, no voice, no push.
- Uses Uniwind (Tailwind v4 for RN) with raw RN primitives. PostHog and Sentry are wired up.
- Drawer navigation via `expo-router/drawer` with two items.

Server-side, every backend capability needed for parity is already built:

- `better-auth` for email/password, Google + GitHub OAuth, email verification, 2FA/TOTP, sessions, account deletion.
- `/conversations` (list, get, update, delete, search via Postgres FTS, export).
- `/user-preferences` (theme, language, notification channels).
- `/user-api-keys` (generate, rotate, revoke).
- `/media/transcribe` (Whisper) and `/media/tts` (streaming MP3).
- `NotificationService` with `email` and `in_app` channels and two trigger sites (budget warning, new-device security alert).

## Out of scope for Phase 23

To keep scope tractable, the following are explicitly deferred:

- Mobile organizations (create/switch/invite UI).
- Mobile billing / Stripe SDK.
- Mobile onboarding wizard (web onboarding flow remains the only path).
- Conversation voice mode (auto-record on silence, auto-play responses).
- Marketing / broadcast push system.
- Web push notifications.
- Video / arbitrary file attachments (images only).

## Shipping plan

Five PRs, in dependency order, each independently reviewable and shippable.

| # | PR | Roadmap items | Depends on |
|---|----|---------------|------------|
| PR-1 | `@repo/ui-native` foundation | (new — unblocks PRs 2–5) | — |
| PR-2 | Mobile auth UI | (new — unblocks PRs 3–5) | PR-1 |
| PR-3 | Conversations + Profile + Settings | #112, #113, #114 | PR-2 |
| PR-4 | Image attachment + Voice I/O | #115, #116 | PR-1 (composer primitives) |
| PR-5 | Push notifications | #117 | PR-2, PR-3 (settings toggle) |

PR-4 only formally depends on PR-1, but should land after PR-2 in practice so the composer redesign isn't reviewed against a guest-only chat screen.

---

## PR-1 — `@repo/ui-native` foundation

### Goal

Port the existing `~/Code/arasfeld/chapters/packages/ui-native` library into this monorepo as `packages/ui-native`, themed and wired into `apps/mobile`. No new mobile screens beyond a proof-of-life refactor of the chat composer.

### Package layout

```
packages/ui-native/
├── package.json              # @repo/ui-native, workspace deps, peerDeps mirroring chapters
├── tsconfig.json             # extends @repo/config/typescript
├── src/
│   ├── components/           # 32 components ported from chapters
│   ├── contexts/             # form-field-context
│   ├── hooks/                # use-controlled-state, use-theme-colors
│   ├── providers/
│   │   └── ui-provider.tsx   # exports UIProvider (renamed from ChaptersProvider)
│   ├── utils/                # cn, haptics
│   └── index.ts              # public surface
└── README.md                 # short — what's in, how to import, where to update
```

Components ported as-is from chapters: `avatar`, `back-button`, `badge`, `bottom-sheet`, `button`, `card`, `checkbox`, `date-time-picker`, `dialog`, `divider`, `empty-state`, `fab`, `field-error`, `filter-chip`, `gradient-fill`, `heading`, `icon-button`, `label`, `parallax-scroll-view`, `popover`, `pressable-feedback`, `screen`, `scrim`, `segmented-control`, `select`, `skeleton`, `spinner`, `surface`, `switch`, `text`, `text-field`, `toast`, `user-avatar`.

### Port procedure

1. `cp -R ~/Code/arasfeld/chapters/packages/ui-native/src packages/ui-native/src` — straight copy of components, contexts, hooks, utils.
2. Rename `ChaptersProvider` → `UIProvider`. File rename `chapters-provider.tsx` → `ui-provider.tsx`. Update `index.ts` export. No other identifier rename — keeps diff small and traceable to source.
3. **Reconcile against upstream HeroUI Native** (`~/Code/heroui-native/src/components/`): for each ported component that has a counterpart upstream, run a `diff` and pull in meaningful fixes that landed after the chapters fork. Apply patches surgically; don't restructure. Document any deliberate divergence inline as a `// chapters: ...` comment.
4. Add the chapters `peerDependencies` to `apps/mobile/package.json`: `@gorhom/bottom-sheet`, `@expo/react-native-action-sheet`, `@react-native-community/datetimepicker`, `@react-native-picker/picker`, `expo-haptics`, `expo-image`, `expo-linear-gradient`, `react-native-svg`, `tailwind-merge`, `tailwind-variants`. Run `pnpm install`.
5. Update `apps/mobile/global.css` and Uniwind / metro config to include `@repo/ui-native` source paths so its `className`s are scanned at build time.
6. Rewrite `use-theme-colors` (or whatever color-source hook is in chapters) to read from `@repo/tokens` so web and mobile share a single source of truth for color tokens.

### Wiring into `apps/mobile`

`apps/mobile/app/_layout.tsx` gains a single `<UIProvider>` wrap around children. `UIProvider` already mounts `ToastProvider` and `ActionSheetProvider` internally — no need for a separate toast provider.

```tsx
<SafeAreaProvider>
  <UIProvider>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(drawer)" />
    </Stack>
  </UIProvider>
</SafeAreaProvider>
```

### Proof-of-life refactor

Refactor the chat composer row in `app/(drawer)/index.tsx` to swap raw `Pressable`/`TextInput`/`View` for `Button`/`TextField`/`Surface` from `@repo/ui-native`. **Composer only** — message-bubble `FlatList` items stay raw for now (they're redesigned in PR-4 alongside attachments). This proves the library renders correctly and themes without ballooning the diff.

### Risks

- **RN / Expo version skew:** chapters is on RN 0.81.5 / Expo 53-ish; this repo is on RN 0.83.2 / Expo 55. A few peer dep versions will need bumping during the port. Most likely friction is in `react-native-reanimated` 4.x APIs.
- **New architecture:** this repo sets `newArchEnabled: true`. Verify `@gorhom/bottom-sheet`, `@expo/react-native-action-sheet`, and `react-native-svg` work under new arch.
- **Theme token bridge:** `use-theme-colors` in chapters may have its own color source. Routing it through `@repo/tokens` is the right long-term shape but may surface mismatches.

---

## PR-2 — Mobile auth UI

### Goal

Add login, register, OAuth, email verification, 2FA challenge, and forgot-password flows to mobile. After this PR, the mobile app launches into a real authentication experience and is no longer guest-accessible.

### Routing

Two mutually-exclusive route groups, gated by session in root `_layout.tsx`:

```
apps/mobile/app/
├── _layout.tsx               # gates: session ? (drawer) : (auth)
├── (auth)/
│   ├── _layout.tsx
│   ├── login.tsx
│   ├── register.tsx
│   ├── verify-email.tsx
│   ├── two-factor.tsx
│   └── forgot-password.tsx
└── (drawer)/                 # existing, now session-gated
```

Root `_layout.tsx` reads `authClient.useSession()`. When `data` is null, renders the `(auth)` Stack; otherwise the `(drawer)` Stack. Expo Router handles the transition automatically when the session token lands or clears.

### Decision: no guest mode on mobile

Mobile always requires sign-in. There is no "Continue as guest" link. This diverges from web (which allows guest chat) but is appropriate for the mobile surface — cleaner UX and satisfies App Store reviewer expectations.

### Screens

- **`login.tsx`** — `Screen` → `Heading` → `TextField` email → `TextField` password → `Button` "Sign in" → `Divider` "or" → `Button` (outline) "Continue with Google" → `Button` (outline) "Continue with GitHub" → `Text` link "Don't have an account? Register" → `Text` link "Forgot password?". `FieldError` under inputs. `Spinner` in button when submitting. `useToast()` for top-level errors.
- **`register.tsx`** — same shape as login plus a name field; on success → `verify-email.tsx`.
- **`verify-email.tsx`** — `Heading` → body explaining "Check your inbox" → `Button` "Resend verification email". Polls `authClient.useSession()` for `user.emailVerified` and auto-redirects to drawer when true. **The verification link itself points to web** — no deep-link handler needed on mobile for the verify token.
- **`two-factor.tsx`** — 6-cell OTP `TextField` (single input, `maxLength={6}`) → `Button` "Verify" → `Text` link "Use backup code instead" toggles to a single backup-code `TextField`. Login screen routes here automatically when `authClient.signIn.email()` returns `twoFactorRedirect: true`.
- **`forgot-password.tsx`** — `TextField` email → `Button` "Send reset link" → success state.

### Auth flow specifics

- **OAuth:** `authClient.signIn.social({ provider: 'google' | 'github' })` from `@better-auth/expo`. The Expo client opens `expo-web-browser` and resolves on deep-link return to `ai-native://...`. The better-auth Expo plugin manages the deep-link listener — no custom handling needed.
- **2FA challenge:** login screen catches `twoFactorRedirect: true` response → `router.push('/two-factor')`. 2FA screen calls `authClient.twoFactor.verifyTotp({ code })` or `verifyBackupCode({ code })`.
- **Sign out:** `authClient.signOut()` clears `expo-secure-store` via the Expo plugin. Root `_layout.tsx` re-renders into `(auth)`.

### Existing-file changes

- `app/_layout.tsx` — add session-gated `Stack` switch.
- `app/(drawer)/settings.tsx` — the existing flat settings screen stays untouched in this PR; its "Not signed in" branch becomes unreachable in practice once gating works. PR-3 replaces it entirely with the nested `settings/` stack.

### Risks

- **OAuth scheme registration:** `ai-native://` scheme is already in `app.json`. Confirm Google/GitHub OAuth redirect URIs are configured in better-auth server config to match.
- **2FA backup code endpoint:** verify `authClient.twoFactor.verifyBackupCode` exists in the `@better-auth/expo` client. If only `verifyTotp` is exposed in the Expo plugin, route backup-code verification through a generic `authClient.fetch('/auth/two-factor/verify-backup-code', ...)` call.

---

## PR-3 — Conversations + Profile + Settings

### Goal

Bring the signed-in surface area to parity with web by binding mobile UIs to endpoints that already exist on the server. No new server endpoints required.

### Route additions

```
apps/mobile/app/(drawer)/
├── _layout.tsx               # Drawer items: Chat, History, Profile, Settings
├── index.tsx                 # existing chat
├── history.tsx               # NEW
├── profile.tsx               # NEW
└── settings/
    ├── _layout.tsx           # NEW — Stack with sub-screens below
    ├── index.tsx             # NEW — settings home
    ├── appearance.tsx        # NEW
    ├── notifications.tsx     # NEW
    ├── api-keys.tsx          # NEW
    └── account.tsx           # NEW
```

Replaces the current flat `settings.tsx` with a nested stack mirroring the iOS Settings app pattern.

### #112 — Conversation history (`history.tsx`)

- `FlatList<Conversation>` from `GET /conversations` via React Query.
- Row shape: avatar placeholder, title, last-message snippet, relative time.
- Tap row → `router.push('/?conversation=<id>')`. Chat screen reads the `?conversation` query param and `GET /conversations/:id/messages` to hydrate.
- Per-row swipe-to-reveal actions via `react-native-gesture-handler`:
  - **Rename:** opens `Dialog` with `TextField` prefilled, `PUT /conversations/:id`.
  - **Delete:** opens `Dialog` with confirm, `DELETE /conversations/:id`.
- Pull-to-refresh wired to React Query `refetch()`.
- Empty state via `<EmptyState>`.
- **Search:** top of list has a `TextField` with debounced (300ms) input → `GET /conversations/search?q=…`. Results replace the list; clearing input restores. `ts_headline` snippets render with the `\x02/\x03` highlight sentinels swapped for highlighted `<Text>` spans.
- Chat screen header gets a "New conversation" button → clears `?conversation` param and `useChat` state.

### #113 — Profile page (`profile.tsx`)

Form-driven editor:

- **Avatar:** `<UserAvatar>` + `Button` "Change photo" → `expo-image-picker` → upload to `POST /auth/upload-avatar` → returns URL → `authClient.updateUser({ image: url })`.
- **Name:** `TextField`, save via `authClient.updateUser({ name })`.
- **Email:** `TextField`, save via `authClient.changeEmail({ newEmail })`. Triggers verification email; show banner explaining the next step.
- Save feedback via `useToast()`.

Two read-only sections below the form:

- **Active sessions:** `FlatList` of `GET /auth/list-sessions` rows with device / IP / last-seen and a per-row revoke button.
- **Security:** link to `settings/account.tsx` for 2FA setup and account deletion.

### #114 — Full settings

- **`settings/index.tsx`** — single `ScrollView` with grouped `ListItem`-style rows linking to each sub-screen.
- **`appearance.tsx`** — `SegmentedControl` with `["System", "Light", "Dark"]`. On change: persist to `user_preferences.theme` via `PUT /user-preferences` AND apply locally via `Uniwind.setTheme()`. Reads existing value on mount.
- **`notifications.tsx`** — `Switch` rows for each channel: `email`, `in_app`, `push` (push row hidden until PR-5 is in). Persists to `user_preferences.notification_channels`.
- **`api-keys.tsx`** — `FlatList` of `GET /user-api-keys` rows showing name + last-used + revoke. `Button` "Generate new key" opens `Dialog` for name input → `POST /user-api-keys` → shows the secret **once** in a copy-to-clipboard surface (via `expo-clipboard`) with a clear "this won't be shown again" warning.
- **`account.tsx`** — `Button` "Enable 2FA" → opens TOTP setup `Dialog` (QR code from `authClient.twoFactor.enable()`, verify code). `Button` (destructive) "Delete account" → typed-confirmation `Dialog` ("type DELETE to confirm") → `authClient.deleteUser()` → app returns to `(auth)/login`.

### Drawer navigation

`app/(drawer)/_layout.tsx` becomes:

```tsx
<Drawer>
  <Drawer.Screen name="index" options={{ title: "Chat" }} />
  <Drawer.Screen name="history" options={{ title: "History" }} />
  <Drawer.Screen name="profile" options={{ title: "Profile" }} />
  <Drawer.Screen name="settings" options={{ title: "Settings" }} />
</Drawer>
```

Custom drawer header shows user avatar + name + email; tap → profile.

### Risks

- **`POST /auth/upload-avatar` contract:** if the web route assumes multipart-from-fetch with specific headers, the mobile uploader may need `FileSystem.uploadAsync` with matching field names. Adjust whichever side is easier during implementation.
- **2FA enable QR code:** rendering the otpauth URI as a QR code requires `react-native-qrcode-svg` or similar — small extra dep.

---

## PR-4 — Image attachment + Voice I/O

### Goal

Bring the chat composer to multi-modal parity with web. Both features touch the same composer and message-rendering code, so they ship together.

### Composer redesign

```
┌─────────────────────────────────────────────┐
│ [attachments preview row, if any]           │  ← horizontal scroll of thumbnails
├─────────────────────────────────────────────┤
│ [📎] [TextField............] [🎤] [↑]       │
└─────────────────────────────────────────────┘
```

- `📎` = `IconButton` → action sheet ("Photo Library" / "Take Photo" / "Cancel")
- `🎤` = `IconButton` → starts/stops recording (visual state toggles to red pulse while recording)
- `↑` = existing send button

State added:

```ts
type Attachment = { id: string; uri: string; mimeType: string; base64?: string };
const [attachments, setAttachments] = useState<Attachment[]>([]);
```

### #115 — Image attachment

**Picker flow:**

1. Tap `📎` → `ActionSheet` (from `@expo/react-native-action-sheet`, already a peer dep of `@repo/ui-native`).
2. `ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', base64: true, quality: 0.8 })` or `launchCameraAsync` (requires `expo-image-picker` permissions in `app.json`).
3. Append to `attachments`. Render in a horizontal preview row above the composer with `[×]` to remove.

**Send flow:** the Vercel AI SDK's `useChat().sendMessage` already supports `files`:

```ts
sendMessage({
  text,
  files: attachments.map(a => ({
    type: 'file',
    mediaType: a.mimeType,
    url: `data:${a.mimeType};base64,${a.base64}`,
  })),
});
setAttachments([]);
```

Backend `chat_service.py` already handles `image_url` parts. **No server changes.**

**Rendering received images:** message bubble renderer adds a `part.type === 'file'` branch using `expo-image`'s `<Image>` for assistant-generated images (DALL-E tool returns these). User-sent images render in their own bubble alongside any text.

**Permissions in `app.json`:**

```json
"plugins": [
  "expo-router",
  ["expo-location", { ... }],
  ["expo-image-picker", {
    "photosPermission": "Allow AI Native to access your photos to attach images to chat.",
    "cameraPermission": "Allow AI Native to access the camera to take photos for chat."
  }]
]
```

### #116 — Voice I/O

**New deps:** `expo-audio` (modern replacement for `expo-av`; record + playback with hooks), `expo-image-picker` (added above).

**STT flow:**

1. Tap 🎤 → request mic permission via `expo-audio.useAudioRecorder()` → start recording (M4A/AAC, mono, 16 kHz to keep upload small).
2. Composer shows pulsing red dot + elapsed timer + cancel / confirm buttons. Send button becomes "stop & transcribe."
3. Tap stop → `recorder.stop()` → local file URI.
4. Upload to `POST /media/transcribe` as multipart form-data via `FileSystem.uploadAsync` with `Authorization: Bearer …` from `authClient.getSession()`.
5. Response `{ text: string }` → set `input` to the transcript. **User can edit before tapping send.** Auto-send is intentionally avoided — STT mishears too often.
6. Errors → `useToast()` "Transcription failed."

**TTS flow:**

1. Each completed assistant bubble gets a small `IconButton` 🔊 in its bottom-right corner (hidden while streaming).
2. Tap → set `playingId` state → fetch `POST /media/tts` with `{ text: message.text }`.
3. Save streamed response to a temp file via `FileSystem.createDownloadResumable` (more robust than streaming directly to `expo-audio` on RN).
4. Play with `useAudioPlayer({ uri: tempFile })`. Icon toggles to ⏹ during playback; tap again to stop.
5. Only one message plays at a time — starting playback on a new message stops the previous.

**Audio session:** configure once at mount via `AudioModule.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' })` so playback works with the phone on silent and ducks other audio rather than stopping it.

### Risks

- **`expo-audio` under new arch:** verify it works with `newArchEnabled: true`. If issues, fall back to `expo-av`.
- **Large image payloads:** base64 data URLs balloon request size. Accept for v1 with `quality: 0.8` JPEG. If it becomes a problem, switch to a presigned-URL upload flow — but that's net-new server work, deferred.
- **Whisper latency:** 30s+ recordings take several seconds to transcribe. UX is "stop button → spinner → input fills." A `Spinner` overlay on the composer covers this; no partial-transcript streaming in v1.

---

## PR-5 — Push notifications

### Goal

Deliver the two existing alert types (budget warnings, new-device security) to mobile as native push notifications. Smallest PR of the five.

### Client

**Deps:** `expo-notifications`, `expo-device` (already installed).

**New hook:** `apps/mobile/hooks/use-push-registration.ts`

```ts
export function usePushRegistration() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    (async () => {
      if (!Device.isDevice) return; // simulators don't get tokens
      const { status: existing } = await Notifications.getPermissionsAsync();
      let status = existing;
      if (existing !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== 'granted') return;
      const token = (await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      })).data;
      await api.post('/auth/push-tokens', {
        token,
        platform: Platform.OS,
      });
    })();
  }, [userId]);
}
```

Mounted once in `app/_layout.tsx` inside the signed-in branch.

**Permission timing:** request lazily on first signed-in launch (per Apple HIG), not at app startup. Users who deny can re-enable via Settings → Notifications, which gains a "Push notifications" row that calls `Linking.openSettings()`.

**Foreground behavior:** `Notifications.setNotificationHandler` shows banner + plays sound even when the app is open. Tap handler reads `notification.data.deepLink` (e.g. `/billing`, `/settings/account`) and `router.push(...)`.

### Server

**Schema:** new table `push_tokens` in `packages/db/src/schema/auth.ts`:

```sql
CREATE TABLE push_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  platform     TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX push_tokens_user_id_idx ON push_tokens(user_id);
```

Migration in `packages/db/migrations/`.

**Endpoints in `apps/server/src/api/routers/auth.py`:**

- `POST /auth/push-tokens` — body `{ token, platform }`, UPSERT on `token`, sets `user_id` to current user.
- `DELETE /auth/push-tokens/:token` — for sign-out cleanup (optional for v1).

**Push channel in `NotificationService`** — adds a `_send_push(user_id, title, body, data)` method that:

1. Looks up tokens via the user-id index.
2. Posts batches of ≤100 to `https://exp.host/--/api/v2/push/send`. Uses `EXPO_ACCESS_TOKEN` env var if present (recommended for production rate limits).
3. On `DeviceNotRegistered` responses, fire-and-forget deletes the invalid token.

**Wire alerts:** the two existing trigger sites (budget warning, new-device security) already call `NotificationService` with `channels=['email', 'in_app']`. Add `'push'` to the channel set (or read it from `user_preferences.notification_channels` if channel selection is per-user).

### EAS project ID

`Notifications.getExpoPushTokenAsync` requires an EAS `projectId` in `app.json` (`expo.extra.eas.projectId`). The current `app.json` doesn't have one. Implementation plan needs to either add it (if there's an EAS project provisioned) or document the manual step. Doesn't affect TestFlight builds; only Expo Go in development can't receive tokens.

### Risks

- **iOS APNs setup:** Expo handles APNs cert/key provisioning through EAS — must be configured in the Expo dashboard before push works in TestFlight or production.
- **Per-user channel preferences:** if the existing `NotificationService` doesn't read `user_preferences.notification_channels`, channel selection becomes a behavior change for email/in-app as well. Confirm during implementation; if it does need changes, scope creep is small.

---

## Cross-cutting concerns

### Testing strategy

Per-PR:

- **PR-1:** smoke-test `pnpm --filter mobile start` boots, composer renders with `@repo/ui-native` primitives, dark/light theme switches correctly.
- **PR-2:** manual flows on iOS + Android — register → verify → login → 2FA → OAuth (both providers) → forgot password → reset.
- **PR-3:** create / rename / delete / search conversations; edit profile; change theme; generate / revoke API key; enable 2FA; delete account.
- **PR-4:** send image (library + camera) → confirm round-trips through chat; record voice → transcript appears in input; tap speaker on assistant message → audio plays.
- **PR-5:** trigger a budget warning (force `tenant.token_count` past 80%); confirm push lands; tap → routes to `/billing`. Trigger new-device alert; confirm push lands.

No new automated test infrastructure is in scope. Existing `pnpm test` / `uv run pytest` continue to run on PRs that touch server code.

### Type safety

- All new mobile API calls go through `apps/mobile/lib/api.ts`. Bodies and responses should use types from `@repo/types/api` where they exist (regenerated via `pnpm --filter @repo/types generate` after any server route change).
- The new `push_tokens` table needs to be added to `packages/db/src/schema/auth.ts`; the Python side picks it up via the shared SQL migration.

### Observability

- PostHog: capture key mobile events — `mobile_signin_succeeded`, `mobile_conversation_loaded`, `mobile_image_attached`, `mobile_voice_recorded`, `mobile_push_registered`. Use existing `usePostHog()` provider.
- Sentry: errors from new flows surface automatically through the existing `Sentry.wrap` wrapper in `_layout.tsx`. Auth-flow errors should additionally `Sentry.captureException(err)` with `setContext('auth', { step })`.

### Documentation

- `ROADMAP.md` — mark #112–#117 ✅ as each PR lands. Add a note in Phase 23 explaining the auth-UI dependency.
- `ARCHITECTURE.md` — add a short subsection under §6 (Frontend) documenting `@repo/ui-native` and its relationship to web's `@repo/ui`.
- `AGENTS.md` — under "What's Already Built", append mobile parity items as each ships.
- No new top-level docs.

---

## Open questions for implementation time

These don't block design approval but should be answered as each PR is planned in detail:

1. PR-1: do any of the 32 ported components depend on chapters-specific design tokens that don't exist in `@repo/tokens`? If so, fold the additions into `@repo/tokens` rather than duplicate.
2. PR-2: does `@better-auth/expo` support `verifyBackupCode` directly, or do we need a generic `authClient.fetch` call?
3. PR-3: confirm `/auth/upload-avatar` contract works for `FileSystem.uploadAsync` or whether to add a mobile-friendly variant.
4. PR-4: does `expo-audio` need any additional setup for new arch?
5. PR-5: is there an EAS project already provisioned, or does one need to be created?
