# Phase 23 — Mobile Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `apps/mobile` to feature parity with web: real auth UI, conversation history, profile, settings, image attachments, voice I/O, and push notifications — built on a ported component library.

**Architecture:** Single feature branch `phase-23-mobile-parity`, executed in five sequential stages, each ending at a logical commit boundary with a manual smoke test. No PRs — final merge to `main` after end-to-end manual review.

**Tech Stack:** Expo 55 + React Native 0.83, Expo Router, `@better-auth/expo`, `@ai-sdk/react`, Uniwind (Tailwind v4 for RN), ported `@repo/ui-native` (from `~/Code/arasfeld/chapters`), `expo-image-picker`, `expo-audio`, `expo-notifications`.

**Spec:** [`docs/superpowers/specs/2026-05-27-phase-23-mobile-parity-design.md`](../specs/2026-05-27-phase-23-mobile-parity-design.md)

---

## Stage 1 — `@repo/ui-native` foundation

**Outcome:** A working `packages/ui-native` exists in this monorepo. `apps/mobile` boots with `UIProvider` mounted and the chat composer rendered with ported `Button` / `TextField` / `Surface` primitives. Dark/light theme switches correctly.

### Task 1.1: Port the library

**Files:**
- Create: `packages/ui-native/package.json`
- Create: `packages/ui-native/tsconfig.json`
- Create: `packages/ui-native/src/**` (copied from chapters)
- Create: `packages/ui-native/README.md`

- [ ] **Step 1: Copy source from chapters**

```bash
mkdir -p packages/ui-native
cp -R ~/Code/arasfeld/chapters/packages/ui-native/src packages/ui-native/src
```

- [ ] **Step 2: Create `packages/ui-native/package.json`**

```json
{
  "name": "@repo/ui-native",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "clean": "rm -rf node_modules"
  },
  "peerDependencies": {
    "@expo/react-native-action-sheet": "*",
    "@gorhom/bottom-sheet": "*",
    "@react-native-community/datetimepicker": "*",
    "@react-native-picker/picker": "*",
    "expo-haptics": "*",
    "expo-image": "*",
    "expo-linear-gradient": "*",
    "react": "*",
    "react-native": "*",
    "react-native-gesture-handler": "*",
    "react-native-reanimated": "*",
    "react-native-safe-area-context": "*",
    "react-native-svg": "*",
    "tailwind-merge": "*",
    "tailwind-variants": "*",
    "uniwind": "*"
  },
  "devDependencies": {
    "@types/react": "~19.2.2",
    "typescript": "5.9.2"
  }
}
```

- [ ] **Step 3: Create `packages/ui-native/tsconfig.json`** matching the pattern in `packages/ui/tsconfig.json`. Inspect that file first; mirror compilerOptions and adjust paths.

- [ ] **Step 4: Rename `ChaptersProvider` → `UIProvider`**

```bash
git mv packages/ui-native/src/providers/chapters-provider.tsx packages/ui-native/src/providers/ui-provider.tsx
```

Edit the renamed file: change `ChaptersProvider` → `UIProvider`, `ChaptersProviderProps` → `UIProviderProps`, `ChaptersProvider.displayName = "ChaptersProvider"` → `UIProvider.displayName = "UIProvider"`.

- [ ] **Step 5: Update `src/index.ts`** — change the export block from `ChaptersProvider` to `UIProvider` and the import path from `./providers/chapters-provider` to `./providers/ui-provider`.

- [ ] **Step 6: Write a minimal README**

```markdown
# @repo/ui-native

React Native UI components for the AI Native Core monorepo. Tailwind v4 via Uniwind. Forked from `chapters/packages/ui-native` (based on HeroUI Native).

## Usage

Wrap your app:

```tsx
import { UIProvider } from "@repo/ui-native";

<UIProvider>{children}</UIProvider>
```

## Updating

To sync with upstream HeroUI Native: diff `~/Code/heroui-native/src/components/<name>` against `src/components/<name>` and patch surgically. Mark deliberate divergences with `// chapters:` comments.
```

- [ ] **Step 7: Commit**

```bash
git add packages/ui-native
git commit -m "feat(ui-native): port chapters ui-native library into monorepo"
```

### Task 1.2: Wire peerDeps into apps/mobile

**Files:**
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Add peer deps**

In `apps/mobile/package.json` under `"dependencies"`, add (preserve alphabetical order):

```json
"@expo/react-native-action-sheet": "^4.1.1",
"@gorhom/bottom-sheet": "^5.2.14",
"@react-native-community/datetimepicker": "8.4.4",
"@react-native-picker/picker": "2.11.1",
"@repo/ui-native": "workspace:*",
"expo-haptics": "~15.0.8",
"expo-image": "~3.0.11",
"expo-linear-gradient": "~15.0.8",
"react-native-svg": "15.12.1",
"tailwind-merge": "^3.5.0",
"tailwind-variants": "^3.1.1",
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: install completes; no peer-dependency warnings for `@repo/ui-native`.

- [ ] **Step 3: Run mobile type check**

```bash
pnpm --filter mobile check-types
```

Expected: passes. If it fails on internal `@repo/ui-native` types, fix those upstream in `packages/ui-native` (most likely a reanimated-4 API gap or missing `expo-image` 3.x type).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml
git commit -m "chore(mobile): add @repo/ui-native peer deps"
```

### Task 1.3: Wire Uniwind to scan ui-native

**Files:**
- Modify: `apps/mobile/global.css`
- Modify: `apps/mobile/metro.config.js`

- [ ] **Step 1: Inspect current Uniwind config**

```bash
cat apps/mobile/global.css apps/mobile/metro.config.js
```

- [ ] **Step 2: Update `global.css` source globs** to include `../../packages/ui-native/src/**/*.{ts,tsx}` (exact syntax depends on the existing `@source` directives — match the established pattern).

- [ ] **Step 3: Update `metro.config.js`** so Metro's `watchFolders` includes `packages/ui-native`. If `withUniwind` wraps the config, ensure its `content` paths include the new package.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/global.css apps/mobile/metro.config.js
git commit -m "chore(mobile): wire Uniwind to scan @repo/ui-native classes"
```

### Task 1.4: Reconcile theme tokens

**Files:**
- Modify: `packages/ui-native/src/hooks/use-theme-colors.ts`

- [ ] **Step 1: Inspect both sides**

```bash
cat packages/ui-native/src/hooks/use-theme-colors.ts
ls packages/tokens/src/
```

- [ ] **Step 2: Rewrite `use-theme-colors`** to source color values from `@repo/tokens` instead of inline literals. Add `@repo/tokens: "workspace:*"` to `packages/ui-native/package.json` `peerDependencies` and to `apps/mobile/package.json` (if not already present).

If `@repo/tokens` doesn't export a colors map yet, leave the hook as-is for now and add a `// TODO: source from @repo/tokens once colors are exported` comment — call this out in the Stage 1 manual test so we don't forget. Theme tokens are not blocking.

- [ ] **Step 3: Commit**

```bash
git add packages/ui-native apps/mobile/package.json pnpm-lock.yaml
git commit -m "chore(ui-native): source theme colors from @repo/tokens"
```

### Task 1.5: Mount UIProvider

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Add the wrap**

Update `AppShell`:

```tsx
import { UIProvider } from "@repo/ui-native";

function AppShell() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <UIProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(drawer)" />
          </Stack>
        </UIProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): mount UIProvider at app root"
```

### Task 1.6: Refactor chat composer to use ui-native

**Files:**
- Modify: `apps/mobile/app/(drawer)/index.tsx`

- [ ] **Step 1: Replace composer primitives**

Replace the existing composer row (the `View` containing `TextInput` + `Pressable`) with:

```tsx
import { Button, TextField, Surface } from "@repo/ui-native";

// ...inside the return, replacing the existing composer View:
<Surface
  variant="default"
  className="flex-row items-end gap-2 border-t border-border px-3 pt-2"
  style={{ paddingBottom: insets.bottom + 8 }}
>
  <TextField.Root className="flex-1">
    <TextField.Input
      value={input}
      onChangeText={setInput}
      placeholder="Message..."
      multiline
      onSubmitEditing={onSubmit}
    />
  </TextField.Root>
  <Button
    variant="solid"
    size="md"
    onPress={onSubmit}
    isDisabled={!input.trim() || isBusy}
    isIconOnly
  >
    {isBusy ? <Spinner size="sm" /> : "↑"}
  </Button>
</Surface>
```

(Adjust component names if the ported library uses different prop names — inspect `packages/ui-native/src/components/{button,text-field,surface}` to confirm.)

Leave the message-bubble `FlatList` rendering untouched.

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/(drawer)/index.tsx
git commit -m "feat(mobile): refactor chat composer to use @repo/ui-native primitives"
```

### Task 1.7: Stage 1 manual smoke test

- [ ] Run `pnpm --filter mobile start`, open iOS sim
- [ ] Confirm app launches with no red screen
- [ ] Confirm chat composer renders correctly (button + text field visible, styled)
- [ ] Send a test message; confirm response streams in
- [ ] Toggle system dark/light mode; confirm composer adapts
- [ ] Type-check passes: `pnpm --filter mobile check-types`

---

## Stage 2 — Mobile auth UI

**Outcome:** Mobile app launches into a login screen when no session exists. Email/password, Google, and GitHub sign-in all work. 2FA challenge, email verification status, and forgot-password flows function end-to-end.

### Task 2.1: Session-gated routing

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/(auth)/_layout.tsx`

- [ ] **Step 1: Create `(auth)` layout**

```tsx
// apps/mobile/app/(auth)/_layout.tsx
import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
```

- [ ] **Step 2: Add session gate to root layout**

Update `AppShell` in `apps/mobile/app/_layout.tsx`:

```tsx
import { authClient } from "@/lib/auth-client";

function AppShell() {
  const { data: session, isPending } = authClient.useSession();

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <UIProvider>
          <Stack screenOptions={{ headerShown: false }}>
            {isPending ? null : session ? (
              <Stack.Screen name="(drawer)" />
            ) : (
              <Stack.Screen name="(auth)" />
            )}
          </Stack>
        </UIProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/_layout.tsx apps/mobile/app/(auth)/_layout.tsx
git commit -m "feat(mobile): gate routing on session, add (auth) route group"
```

### Task 2.2: Login screen

**Files:**
- Create: `apps/mobile/app/(auth)/login.tsx`
- Create: `apps/mobile/features/auth/LoginForm.tsx`

- [ ] **Step 1: Create `LoginForm` component**

```tsx
// apps/mobile/features/auth/LoginForm.tsx
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  Button,
  Divider,
  FieldError,
  Heading,
  Screen,
  Spinner,
  Text,
  TextField,
  useToast,
} from "@repo/ui-native";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message ?? "Sign in failed");
        return;
      }
      if ((res.data as { twoFactorRedirect?: boolean })?.twoFactorRedirect) {
        router.push("/two-factor");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onOAuth = async (provider: "google" | "github") => {
    setSubmitting(true);
    try {
      await authClient.signIn.social({ provider, callbackURL: "/" });
    } catch (e) {
      toast.show({
        variant: "error",
        title: "OAuth failed",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen className="gap-4 px-6 pt-12">
      <Heading variant="h1">Welcome back</Heading>
      <Text variant="body" className="text-muted-foreground">
        Sign in to continue
      </Text>

      <View className="gap-3 pt-4">
        <TextField.Root>
          <TextField.Input
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </TextField.Root>
        <TextField.Root>
          <TextField.Input
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />
        </TextField.Root>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button
          onPress={onSubmit}
          isDisabled={submitting || !email || !password}
        >
          {submitting ? <Spinner size="sm" /> : "Sign in"}
        </Button>
      </View>

      <View className="flex-row items-center gap-3 pt-4">
        <Divider className="flex-1" />
        <Text variant="caption" className="text-muted-foreground">
          or
        </Text>
        <Divider className="flex-1" />
      </View>

      <View className="gap-2">
        <Button variant="bordered" onPress={() => onOAuth("google")}>
          Continue with Google
        </Button>
        <Button variant="bordered" onPress={() => onOAuth("github")}>
          Continue with GitHub
        </Button>
      </View>

      <View className="flex-row justify-between pt-2">
        <Text
          onPress={() => router.push("/forgot-password")}
          className="text-primary"
        >
          Forgot password?
        </Text>
        <Text onPress={() => router.push("/register")} className="text-primary">
          Create account
        </Text>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 2: Create the route file**

```tsx
// apps/mobile/app/(auth)/login.tsx
import { LoginForm } from "@/features/auth/LoginForm";
export default LoginForm;
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(auth)/login.tsx apps/mobile/features/auth/LoginForm.tsx
git commit -m "feat(mobile): add login screen"
```

### Task 2.3: Register screen

**Files:**
- Create: `apps/mobile/app/(auth)/register.tsx`
- Create: `apps/mobile/features/auth/RegisterForm.tsx`

- [ ] **Step 1: Mirror `LoginForm` shape but add a name field and call `authClient.signUp.email({ name, email, password })`**. On success → `router.replace("/verify-email")`. Reuse OAuth handler shape.

- [ ] **Step 2: Create the route shell** (same one-liner pattern as login).

- [ ] **Step 3: Commit** with message `feat(mobile): add register screen`.

### Task 2.4: Email verification screen

**Files:**
- Create: `apps/mobile/app/(auth)/verify-email.tsx`
- Create: `apps/mobile/features/auth/VerifyEmailScreen.tsx`

- [ ] **Step 1: Implement screen**

```tsx
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Button, Heading, Screen, Text, useToast } from "@repo/ui-native";
import { authClient } from "@/lib/auth-client";

export function VerifyEmailScreen() {
  const router = useRouter();
  const toast = useToast();
  const { data: session, refetch } = authClient.useSession();

  useEffect(() => {
    if (session?.user?.emailVerified) {
      router.replace("/");
    }
  }, [router, session?.user?.emailVerified]);

  useEffect(() => {
    const id = setInterval(() => refetch(), 5000);
    return () => clearInterval(id);
  }, [refetch]);

  const resend = async () => {
    try {
      await authClient.sendVerificationEmail({
        email: session?.user?.email ?? "",
      });
      toast.show({ variant: "success", title: "Verification email sent" });
    } catch {
      toast.show({ variant: "error", title: "Failed to send" });
    }
  };

  return (
    <Screen className="gap-4 px-6 pt-12">
      <Heading variant="h1">Check your inbox</Heading>
      <Text>
        We sent a verification link to{" "}
        <Text className="font-semibold">{session?.user?.email}</Text>.
      </Text>
      <Button variant="bordered" onPress={resend}>
        Resend email
      </Button>
      <Button variant="ghost" onPress={() => authClient.signOut()}>
        Sign out
      </Button>
    </Screen>
  );
}
```

- [ ] **Step 2: Route shell + commit** as `feat(mobile): add email verification screen`.

### Task 2.5: 2FA challenge screen

**Files:**
- Create: `apps/mobile/app/(auth)/two-factor.tsx`
- Create: `apps/mobile/features/auth/TwoFactorScreen.tsx`

- [ ] **Step 1: Implement screen**

```tsx
import { useState } from "react";
import { useRouter } from "expo-router";
import {
  Button,
  FieldError,
  Heading,
  Screen,
  Spinner,
  Text,
  TextField,
} from "@repo/ui-native";
import { authClient } from "@/lib/auth-client";

export function TwoFactorScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = useBackup
        ? await authClient.twoFactor.verifyBackupCode({ code })
        : await authClient.twoFactor.verifyTotp({ code });
      if (res.error) {
        setError(res.error.message ?? "Invalid code");
        return;
      }
      router.replace("/");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen className="gap-4 px-6 pt-12">
      <Heading variant="h1">Two-factor authentication</Heading>
      <Text>
        Enter the {useBackup ? "backup" : "6-digit"} code from your
        authenticator app.
      </Text>
      <TextField.Root>
        <TextField.Input
          placeholder={useBackup ? "Backup code" : "123 456"}
          value={code}
          onChangeText={setCode}
          keyboardType={useBackup ? "default" : "number-pad"}
          maxLength={useBackup ? undefined : 6}
          autoFocus
        />
      </TextField.Root>
      {error ? <FieldError>{error}</FieldError> : null}
      <Button onPress={verify} isDisabled={!code || submitting}>
        {submitting ? <Spinner size="sm" /> : "Verify"}
      </Button>
      <Text
        className="text-primary"
        onPress={() => {
          setUseBackup((v) => !v);
          setCode("");
        }}
      >
        {useBackup ? "Use authenticator code instead" : "Use backup code instead"}
      </Text>
    </Screen>
  );
}
```

- [ ] **Step 2: Route shell + commit** as `feat(mobile): add 2FA challenge screen`.

### Task 2.6: Forgot password screen

**Files:**
- Create: `apps/mobile/app/(auth)/forgot-password.tsx`
- Create: `apps/mobile/features/auth/ForgotPasswordScreen.tsx`

- [ ] **Step 1: Implement** — single email field → `authClient.forgetPassword({ email, redirectTo: webUrl + "/reset-password" })` → success state shows "Check your inbox" and a back link to login.

- [ ] **Step 2: Route shell + commit** as `feat(mobile): add forgot password screen`.

### Task 2.7: Update Settings sign-in flow

**Files:**
- Modify: `apps/mobile/app/(drawer)/settings.tsx`

- [ ] **Step 1: Replace "Not signed in" branch with an explicit "Sign in" button** (kept as safety net; routing now guarantees this branch is unreachable, but harmless).

```tsx
import { Button } from "@repo/ui-native";
import { useRouter } from "expo-router";
// ...
<Button onPress={() => router.replace("/login")}>Sign in</Button>
```

- [ ] **Step 2: Commit** as `feat(mobile): wire settings sign-in link to (auth) stack`.

### Task 2.8: Stage 2 manual smoke test

- [ ] App launches into login screen when signed out (clear `expo-secure-store` if needed)
- [ ] Email/password registration → email verification screen → manually verify via inbox → redirects to chat
- [ ] Sign out from chat → returns to login
- [ ] Email/password sign in works
- [ ] Google OAuth completes (deep-link returns into app)
- [ ] GitHub OAuth completes
- [ ] Enable 2FA on web (with same account) → sign out mobile → sign in → 2FA challenge appears → verify code works
- [ ] Forgot password sends email
- [ ] `pnpm --filter mobile check-types` passes

---

## Stage 3 — Conversations + Profile + Settings

**Outcome:** Drawer has Chat / History / Profile / Settings entries. Conversation list works (rename, delete, search, switch). Profile editor saves. Settings has Appearance / Notifications / API Keys / Account sub-screens.

### Task 3.1: Drawer restructure

**Files:**
- Modify: `apps/mobile/app/(drawer)/_layout.tsx`

- [ ] **Step 1: Add drawer entries**

```tsx
import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function DrawerLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer>
        <Drawer.Screen name="index" options={{ title: "Chat" }} />
        <Drawer.Screen name="history" options={{ title: "History" }} />
        <Drawer.Screen name="profile" options={{ title: "Profile" }} />
        <Drawer.Screen name="settings" options={{ title: "Settings" }} />
      </Drawer>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 2: Commit** as `feat(mobile): add History/Profile/Settings drawer entries`.

### Task 3.2: API client helpers for conversations

**Files:**
- Create: `apps/mobile/features/conversations/api.ts`

- [ ] **Step 1: Implement React Query hooks**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Conversation = {
  id: string;
  title: string;
  lastMessageAt: string;
  preview?: string;
};

export function useConversations(search?: string) {
  return useQuery({
    queryKey: ["conversations", search ?? ""],
    queryFn: async () => {
      const path = search
        ? `/conversations/search?q=${encodeURIComponent(search)}`
        : `/conversations`;
      const res = await api.get(path);
      if (!res.ok) throw new Error("Failed to load conversations");
      return (await res.json()) as Conversation[];
    },
  });
}

export function useRenameConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await api.post(`/conversations/${id}`, { title });
      if (!res.ok) throw new Error("Rename failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.get(`/conversations/${id}`); // adjust: needs DELETE
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}
```

**Note:** `lib/api.ts` currently only exposes `get` and `post`. Extend it with `put` and `delete` methods before using above:

```ts
// in apps/mobile/lib/api.ts
export const api = {
  get: (path: string) => apiFetch(path, { method: "GET" }),
  post: (path: string, body: unknown) =>
    apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path: string, body: unknown) =>
    apiFetch(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path: string) => apiFetch(path, { method: "DELETE" }),
};
```

Then fix `useRenameConversation` to use `api.put` and `useDeleteConversation` to use `api.delete`.

- [ ] **Step 2: Commit** as `feat(mobile): add conversations api hooks`.

### Task 3.3: History screen

**Files:**
- Create: `apps/mobile/app/(drawer)/history.tsx`
- Create: `apps/mobile/features/conversations/HistoryScreen.tsx`
- Create: `apps/mobile/features/conversations/ConversationRow.tsx`

- [ ] **Step 1: Implement `ConversationRow`** with swipe-to-reveal actions using `react-native-gesture-handler`'s `Swipeable`. Rename action opens a `Dialog` with `TextField`; delete action opens a confirm `Dialog`.

- [ ] **Step 2: Implement `HistoryScreen`** with debounced search `TextField` at top, `FlatList<Conversation>` body, `EmptyState` when empty, pull-to-refresh via `RefreshControl` wired to React Query `refetch`.

- [ ] **Step 3: Tap row → `router.push("/?conversation=" + id)`**

- [ ] **Step 4: Route shell + commit** as `feat(mobile): add conversation history screen`.

### Task 3.4: Chat screen ?conversation= integration

**Files:**
- Modify: `apps/mobile/app/(drawer)/index.tsx`

- [ ] **Step 1: Read `?conversation` from `useLocalSearchParams()`**, load initial messages via `GET /conversations/:id/messages`, and pass to `useChat({ initialMessages })`. Add a "New" header button that clears the param.

- [ ] **Step 2: Commit** as `feat(mobile): load conversation into chat from history`.

### Task 3.5: Profile screen

**Files:**
- Create: `apps/mobile/app/(drawer)/profile.tsx`
- Create: `apps/mobile/features/profile/ProfileScreen.tsx`
- Create: `apps/mobile/features/profile/AvatarPicker.tsx`
- Create: `apps/mobile/features/profile/SessionsList.tsx`

- [ ] **Step 1: `AvatarPicker`** — `UserAvatar` + `Button` "Change photo" → `ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 })` → upload via `FileSystem.uploadAsync` to `/auth/upload-avatar` (confirm endpoint exists in `apps/server/src/api/routers/auth.py`; if not, fall back to base64 via `authClient.updateUser({ image: dataUrl })`).

- [ ] **Step 2: `ProfileScreen`** — name `TextField`, email `TextField`, save buttons. Save: `authClient.updateUser({ name })` and `authClient.changeEmail({ newEmail })`. Show banner if email change triggered re-verification.

- [ ] **Step 3: `SessionsList`** — `FlatList` of `authClient.multiSession.listDeviceSessions()` (or `GET /auth/list-sessions`); per-row revoke button calls `authClient.revokeSession({ token })`.

- [ ] **Step 4: Route shell + commit** as `feat(mobile): add profile screen with name/email/avatar/sessions`.

### Task 3.6: Settings stack

**Files:**
- Delete: `apps/mobile/app/(drawer)/settings.tsx`
- Create: `apps/mobile/app/(drawer)/settings/_layout.tsx`
- Create: `apps/mobile/app/(drawer)/settings/index.tsx`
- Create: `apps/mobile/app/(drawer)/settings/appearance.tsx`
- Create: `apps/mobile/app/(drawer)/settings/notifications.tsx`
- Create: `apps/mobile/app/(drawer)/settings/api-keys.tsx`
- Create: `apps/mobile/app/(drawer)/settings/account.tsx`
- Create: `apps/mobile/features/settings/{AppearanceScreen,NotificationsScreen,ApiKeysScreen,AccountScreen,SettingsHome}.tsx`

- [ ] **Step 1: Delete the flat settings file**

```bash
git rm apps/mobile/app/(drawer)/settings.tsx
```

- [ ] **Step 2: Create stack layout** with `headerShown: true` and per-screen titles.

- [ ] **Step 3: `SettingsHome`** — `ScrollView` with row links to each sub-screen (Appearance, Notifications, API Keys, Account). Use `ListItem`-pattern row (likely `Surface` + `Pressable` + chevron icon).

- [ ] **Step 4: `AppearanceScreen`**

```tsx
import { SegmentedControl } from "@repo/ui-native";
import { Uniwind } from "uniwind";
// load current preference, render SegmentedControl with ["System","Light","Dark"]
// onChange: PUT /user-preferences { theme }, Uniwind.setTheme(value)
```

- [ ] **Step 5: `NotificationsScreen`** — `Switch` rows for `email`, `in_app`. (Push row added in Stage 5.) Persists via PUT `/user-preferences`.

- [ ] **Step 6: `ApiKeysScreen`** — list via `GET /user-api-keys`, "Generate" opens `Dialog` for name input → `POST /user-api-keys` → display key once in a copy-to-clipboard `Surface` (via `expo-clipboard`).

- [ ] **Step 7: `AccountScreen`** — "Enable 2FA" button → opens TOTP setup `Dialog` (renders QR via `react-native-qrcode-svg` from `authClient.twoFactor.enable()` URI), then 6-digit verify. "Delete account" → typed-DELETE confirm `Dialog` → `authClient.deleteUser()`.

- [ ] **Step 8: Add deps**

```bash
pnpm --filter mobile add expo-clipboard react-native-qrcode-svg
```

- [ ] **Step 9: Commit** as `feat(mobile): add nested settings stack (appearance/notifications/api keys/account)`.

### Task 3.7: Stage 3 manual smoke test

- [ ] Drawer shows 4 entries; all open correctly
- [ ] History: see existing conversations, search works (with web-created conversations), rename + delete via swipe work
- [ ] Tapping a history row loads the conversation in chat
- [ ] Profile: change name → confirms; change avatar → image uploads + displays
- [ ] Settings → Appearance: switching theme persists across app restart
- [ ] Settings → API Keys: generate, copy, revoke
- [ ] Settings → Account: 2FA setup QR renders + verify works; delete account works (then re-register)
- [ ] `pnpm --filter mobile check-types` passes

---

## Stage 4 — Image attachments + Voice I/O

**Outcome:** Chat composer has 📎 (image picker) and 🎤 (voice record) buttons. Images send and render in messages. Voice records, transcribes via Whisper, fills input. Speaker icon on assistant messages plays TTS.

### Task 4.1: Add Expo permissions and deps

**Files:**
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Add deps**

```bash
pnpm --filter mobile add expo-image-picker expo-audio
```

- [ ] **Step 2: Add to app.json plugins**

```json
"plugins": [
  "expo-router",
  ["expo-location", { ... existing ... }],
  ["expo-image-picker", {
    "photosPermission": "Allow AI Native to access your photos to attach images to chat.",
    "cameraPermission": "Allow AI Native to access the camera to take photos for chat."
  }],
  ["expo-audio", {
    "microphonePermission": "Allow AI Native to access the microphone to transcribe voice messages."
  }]
]
```

- [ ] **Step 3: Commit** as `chore(mobile): add expo-image-picker, expo-audio + permissions`.

### Task 4.2: Image attachment

**Files:**
- Create: `apps/mobile/features/chat/AttachmentPicker.tsx`
- Create: `apps/mobile/features/chat/AttachmentPreviewRow.tsx`
- Modify: `apps/mobile/app/(drawer)/index.tsx`

- [ ] **Step 1: `AttachmentPicker`** — `IconButton` 📎 → `useActionSheet().showActionSheetWithOptions({ options: ['Photo Library', 'Take Photo', 'Cancel'], cancelButtonIndex: 2 })` → call `ImagePicker.launchImageLibraryAsync` or `launchCameraAsync` with `{ mediaTypes: 'images', base64: true, quality: 0.8 }`. On result, call `onAdd({ id, uri, mimeType: 'image/jpeg', base64 })`.

- [ ] **Step 2: `AttachmentPreviewRow`** — horizontal `ScrollView` of small `expo-image` `Image` thumbnails with `[×]` overlay button.

- [ ] **Step 3: Wire into chat screen**

In `app/(drawer)/index.tsx`, add `attachments` state and pass `files` to `sendMessage`:

```tsx
sendMessage({
  text,
  files: attachments.map(a => ({
    type: 'file' as const,
    mediaType: a.mimeType,
    url: `data:${a.mimeType};base64,${a.base64}`,
  })),
});
setAttachments([]);
```

- [ ] **Step 4: Render images in messages**

In the `renderItem`, add a `part.type === 'file'` branch using `expo-image`'s `Image` with `style={{ width: 200, height: 200 }}` for inline image rendering.

- [ ] **Step 5: Commit** as `feat(mobile): add image attachment in chat composer`.

### Task 4.3: Voice STT

**Files:**
- Create: `apps/mobile/features/chat/VoiceRecorder.tsx`
- Modify: `apps/mobile/app/(drawer)/index.tsx`

- [ ] **Step 1: `VoiceRecorder` component**

```tsx
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
} from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { IconButton, Spinner } from "@repo/ui-native";
import * as FileSystem from "expo-file-system";
import { env } from "@repo/env/native";
import { authClient } from "@/lib/auth-client";

export function VoiceRecorder({ onTranscript }: { onTranscript: (text: string) => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    AudioModule.requestRecordingPermissionsAsync();
  }, []);

  const start = async () => {
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const stop = async () => {
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return;
    setBusy(true);
    try {
      const session = await authClient.getSession();
      const result = await FileSystem.uploadAsync(
        `${env.EXPO_PUBLIC_SERVER_URL}/media/transcribe`,
        uri,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: "audio",
          headers: session?.data?.session?.token
            ? { Authorization: `Bearer ${session.data.session.token}` }
            : {},
        }
      );
      const { text } = JSON.parse(result.body) as { text: string };
      onTranscript(text);
    } finally {
      setBusy(false);
    }
  };

  if (busy) return <Spinner size="sm" />;
  if (recorder.isRecording) {
    return <IconButton onPress={stop} icon="stop" />;
  }
  return <IconButton onPress={start} icon="mic" />;
}
```

(Adjust to actual `IconButton` API; substitute icon strings with the icon library used in `@repo/ui-native`, likely `@expo/vector-icons`.)

- [ ] **Step 2: Insert into composer row** between text input and send button.

- [ ] **Step 3: Wire `onTranscript` → `setInput`**.

- [ ] **Step 4: Commit** as `feat(mobile): add voice recording → /media/transcribe → input`.

### Task 4.4: Voice TTS playback

**Files:**
- Create: `apps/mobile/features/chat/MessageSpeakerButton.tsx`
- Modify: `apps/mobile/app/(drawer)/index.tsx`

- [ ] **Step 1: `MessageSpeakerButton` component**

```tsx
import { useAudioPlayer } from "expo-audio";
import { useState } from "react";
import { IconButton } from "@repo/ui-native";
import * as FileSystem from "expo-file-system";
import { env } from "@repo/env/native";
import { authClient } from "@/lib/auth-client";

export function MessageSpeakerButton({ text }: { text: string }) {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const player = useAudioPlayer(uri);

  const play = async () => {
    if (player.playing) {
      player.pause();
      return;
    }
    if (uri) {
      player.play();
      return;
    }
    setLoading(true);
    try {
      const session = await authClient.getSession();
      const tempUri = FileSystem.cacheDirectory + "tts-" + Date.now() + ".mp3";
      const result = await FileSystem.downloadAsync(
        `${env.EXPO_PUBLIC_SERVER_URL}/media/tts`,
        tempUri,
        {
          headers: session?.data?.session?.token
            ? { Authorization: `Bearer ${session.data.session.token}` }
            : {},
        }
      );
      // /media/tts expects POST with body — switch to FileSystem.uploadAsync or custom fetch+save
      setUri(result.uri);
      player.play();
    } finally {
      setLoading(false);
    }
  };

  return <IconButton onPress={play} icon={player.playing ? "stop" : "volume-high"} loading={loading} />;
}
```

**Note:** `FileSystem.downloadAsync` is GET-only. `/media/tts` is POST. Use a streaming fetch + write-to-file:

```ts
const res = await expoFetch(`${env.EXPO_PUBLIC_SERVER_URL}/media/tts`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(session?.data?.session?.token
      ? { Authorization: `Bearer ${session.data.session.token}` }
      : {}),
  },
  body: JSON.stringify({ text }),
});
const buffer = await res.arrayBuffer();
const base64 = arrayBufferToBase64(buffer);
await FileSystem.writeAsStringAsync(tempUri, base64, { encoding: FileSystem.EncodingType.Base64 });
```

- [ ] **Step 2: Render speaker button on completed assistant messages**

In `renderItem`, when `item.role === 'assistant'` and `!isBusy`, render `<MessageSpeakerButton text={textContent} />` in the bubble's footer row.

- [ ] **Step 3: Configure audio session at app mount**

In `app/_layout.tsx`, add:

```tsx
import { AudioModule } from "expo-audio";

useEffect(() => {
  AudioModule.setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: "duckOthers",
  });
}, []);
```

- [ ] **Step 4: Commit** as `feat(mobile): add TTS playback on assistant messages`.

### Task 4.5: Stage 4 manual smoke test

- [ ] Tap 📎 → image picker → choose photo → preview shows → send → image renders in user bubble
- [ ] Tap 📎 → take photo → same flow
- [ ] Tap 🎤 → record → stop → transcript appears in input → send
- [ ] Receive assistant response → tap 🔊 → audio plays → tap again to stop
- [ ] Phone on silent: TTS still plays (audio session config working)
- [ ] `pnpm --filter mobile check-types` passes

---

## Stage 5 — Push notifications

**Outcome:** Signed-in mobile users register an Expo push token. Budget warnings (80%/100%) and new-device security alerts deliver as native pushes.

### Task 5.1: Server — push_tokens schema

**Files:**
- Create: `packages/db/migrations/NNNN_push_tokens.sql`
- Modify: `packages/db/src/schema/auth.ts`

- [ ] **Step 1: Find next migration number**

```bash
ls packages/db/migrations/ | sort | tail -3
```

- [ ] **Step 2: Create SQL migration**

```sql
-- packages/db/migrations/NNNN_push_tokens.sql
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

- [ ] **Step 3: Add Drizzle schema**

Add to `packages/db/src/schema/auth.ts`:

```ts
import { pgTable, text, timestamp, uuid, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    platform: text("platform").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => ({
    userIdIdx: index("push_tokens_user_id_idx").on(t.userId),
    platformCk: check("push_tokens_platform_ck", sql`${t.platform} IN ('ios','android','web')`),
  })
);
```

- [ ] **Step 4: Run migration**

```bash
psql $DATABASE_URL -f packages/db/migrations/NNNN_push_tokens.sql
```

- [ ] **Step 5: Commit** as `feat(db): add push_tokens table`.

### Task 5.2: Server — push token endpoints

**Files:**
- Modify: `apps/server/src/api/routers/auth.py`

- [ ] **Step 1: Add endpoints**

```python
from pydantic import BaseModel
from sqlalchemy import text

class PushTokenIn(BaseModel):
    token: str
    platform: str  # 'ios' | 'android' | 'web'

@router.post("/push-tokens")
async def register_push_token(
    body: PushTokenIn,
    user: AuthUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db_conn),
):
    if user.is_guest:
        raise HTTPException(401)
    await db.execute(
        text("""
            INSERT INTO push_tokens (user_id, token, platform, last_used_at)
            VALUES (:user_id, :token, :platform, NOW())
            ON CONFLICT (token) DO UPDATE SET
              user_id = EXCLUDED.user_id,
              platform = EXCLUDED.platform,
              last_used_at = NOW()
        """),
        {"user_id": user.id, "token": body.token, "platform": body.platform},
    )
    return {"ok": True}

@router.delete("/push-tokens/{token}")
async def delete_push_token(
    token: str,
    user: AuthUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db_conn),
):
    await db.execute(
        text("DELETE FROM push_tokens WHERE token = :token AND user_id = :user_id"),
        {"token": token, "user_id": user.id},
    )
    return {"ok": True}
```

(Adjust imports + DB session pattern to match existing `auth.py` conventions — inspect first.)

- [ ] **Step 2: Add a test**

```python
# apps/server/tests/api/test_push_tokens.py
async def test_register_push_token_idempotent(client, signed_in_user):
    r1 = await client.post("/auth/push-tokens", json={"token": "ExponentPushToken[abc]", "platform": "ios"})
    assert r1.status_code == 200
    r2 = await client.post("/auth/push-tokens", json={"token": "ExponentPushToken[abc]", "platform": "ios"})
    assert r2.status_code == 200
    # only one row exists for this token
```

- [ ] **Step 3: Run test**

```bash
uv run pytest apps/server/tests/api/test_push_tokens.py -v
```

- [ ] **Step 4: Commit** as `feat(server): add /auth/push-tokens register + delete`.

### Task 5.3: Server — Expo push channel

**Files:**
- Modify: `services/notifications/src/notifications/service.py` (or equivalent location — inspect first)

- [ ] **Step 1: Add `_send_push` method**

```python
import httpx
from typing import Any

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

async def _send_push(self, user_id: str, *, title: str, body: str, data: dict[str, Any] | None = None):
    tokens = await self.repo.get_push_tokens(user_id)
    if not tokens:
        return
    messages = [
        {"to": t.token, "title": title, "body": body, "data": data or {}}
        for t in tokens
    ]
    headers = {}
    if (access := os.getenv("EXPO_ACCESS_TOKEN")):
        headers["Authorization"] = f"Bearer {access}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        for i in range(0, len(messages), 100):
            try:
                resp = await client.post(EXPO_PUSH_URL, json=messages[i:i+100], headers=headers)
                # Best-effort: parse response and delete tokens for DeviceNotRegistered errors
                payload = resp.json()
                if payload.get("data"):
                    for msg_result, msg in zip(payload["data"], messages[i:i+100]):
                        if msg_result.get("status") == "error" and msg_result.get("details", {}).get("error") == "DeviceNotRegistered":
                            await self.repo.delete_token(msg["to"])
            except Exception as e:
                logger.warning("expo push failed", error=str(e))
```

- [ ] **Step 2: Add `get_push_tokens` + `delete_token` to the notification repository** (or wherever push tokens are read).

- [ ] **Step 3: Wire `push` into the `Channel` enum** and into the two existing alert sites (budget warning, new-device security). Confirm channel selection respects `user_preferences.notification_channels`; if not, default `push` ON for users with at least one registered token.

- [ ] **Step 4: Add a test**

```python
async def test_send_push_skips_when_no_tokens(notification_service, monkeypatch):
    posted = []
    async def fake_post(self, url, json, headers): posted.append((url, json))
    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    await notification_service._send_push("user-with-no-tokens", title="x", body="y")
    assert posted == []
```

- [ ] **Step 5: Commit** as `feat(notifications): add Expo push channel`.

### Task 5.4: Mobile — register push token

**Files:**
- Create: `apps/mobile/hooks/use-push-registration.ts`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app.json`

- [ ] **Step 1: Add EAS projectId to `app.json`** if one isn't already present:

```json
"expo": {
  ...
  "extra": {
    "eas": {
      "projectId": "<from EAS dashboard, or leave as a TODO if not yet provisioned>"
    }
  }
}
```

If no EAS project exists yet, document in the manual test that push only works after EAS init.

- [ ] **Step 2: Hook implementation**

```ts
// apps/mobile/hooks/use-push-registration.ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useEffect } from "react";
import { Platform } from "react-native";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";

export function usePushRegistration() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId || !Device.isDevice) return;
    (async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let status = existing;
      if (existing !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== "granted") return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await api.post("/auth/push-tokens", { token, platform: Platform.OS });
    })();
  }, [userId]);
}
```

- [ ] **Step 3: Mount in root layout** inside a small `<PushRegistrar/>` component rendered after `UIProvider`, only on signed-in branch:

```tsx
function PushRegistrar() {
  usePushRegistration();
  return null;
}
// in AppShell, signed-in branch: <PushRegistrar />
```

- [ ] **Step 4: Configure foreground handler** at module scope in `_layout.tsx`:

```tsx
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

- [ ] **Step 5: Add deep-link tap handler**

```tsx
useEffect(() => {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const link = response.notification.request.content.data?.deepLink as string | undefined;
    if (link) router.push(link as never);
  });
  return () => sub.remove();
}, [router]);
```

- [ ] **Step 6: Commit** as `feat(mobile): register expo push token on login + deep-link handler`.

### Task 5.5: Mobile — push channel toggle in settings

**Files:**
- Modify: `apps/mobile/features/settings/NotificationsScreen.tsx`

- [ ] **Step 1: Add "Push notifications" `Switch` row**. When OFF, call `DELETE /auth/push-tokens/:token` for the current device's token (stash it in `expo-secure-store` on registration so we can find it later). When ON, re-run registration.

- [ ] **Step 2: Add link "Open system settings"** via `Linking.openSettings()` for users whose OS permission is denied.

- [ ] **Step 3: Commit** as `feat(mobile): add push notifications toggle in settings`.

### Task 5.6: Stage 5 manual smoke test

- [ ] On a physical device (push doesn't work on simulators), sign in
- [ ] Permission prompt appears; grant
- [ ] Check DB: `SELECT * FROM push_tokens;` shows your token
- [ ] Trigger a budget alert (force-update `tenant.token_count` past 80% OR call the alert function directly via a one-off script)
- [ ] Push notification appears on phone
- [ ] Tap notification → app opens to `/billing`
- [ ] Repeat for new-device security alert (sign in from a new IP)
- [ ] Toggle "Push notifications" OFF in settings → token deleted → trigger alert → no push
- [ ] `pnpm --filter mobile check-types` + `uv run pytest` both pass

---

## Final review & merge

- [ ] Full manual run-through against the spec
- [ ] `pnpm check-types` (all packages) passes
- [ ] `pnpm check` (lint/format) clean
- [ ] `uv run pytest` passes
- [ ] `uv run ruff check . && uv run ruff format .` clean
- [ ] Update `ROADMAP.md`: mark items #112–#117 ✅ with brief notes
- [ ] Update `AGENTS.md` "What's Already Built" with mobile parity items
- [ ] Add `@repo/ui-native` to `ARCHITECTURE.md` §6 (Frontend)
- [ ] Merge `phase-23-mobile-parity` → `main`

---

## Open implementation-time questions (from spec)

1. **Stage 1:** any of the 32 components depend on chapters-specific tokens missing from `@repo/tokens`? Fold additions into `@repo/tokens` rather than duplicate.
2. **Stage 2:** does `@better-auth/expo` expose `verifyBackupCode` directly? If not, fall through to a generic `authClient.fetch` call.
3. **Stage 3:** does `/auth/upload-avatar` accept `FileSystem.uploadAsync` multipart? If not, fall back to data-URL via `authClient.updateUser({ image })`.
4. **Stage 4:** `expo-audio` under new arch — verify; fall back to `expo-av` if it breaks.
5. **Stage 5:** is an EAS `projectId` provisioned? If not, document the manual step and ship with a `null` projectId guard.
