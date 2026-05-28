# @repo/ui-native

React Native UI components for the AI Native Core monorepo. Tailwind v4 via Uniwind. Forked from `chapters/packages/ui-native` (which is itself based on HeroUI Native).

## Usage

Wrap your app:

```tsx
import { UIProvider } from "@repo/ui-native";

<UIProvider>{children}</UIProvider>
```

`UIProvider` mounts `ToastProvider` and `ActionSheetProvider` internally. Make sure `GestureHandlerRootView` is mounted above it (required for `BottomSheet` and `Popover`).

## Components

Avatar, BackButton, Badge, BottomSheet, Button, Card, Checkbox, DateTimePicker, Dialog, Divider, EmptyState, Fab, FieldError, FilterChip, GradientFill, Heading, IconButton, Label, ParallaxScrollView, Popover, PressableFeedback, Screen, Scrim, SegmentedControl, Select, Skeleton, Spinner, Surface, Switch, Text, TextField, Toast, UserAvatar.

## Theming

Color tokens are read at runtime from CSS variables (`--color-background`, etc.) via Uniwind's `useCSSVariable`. The mobile app declares these in `apps/mobile/global.css` (`@theme` + `@theme dark` blocks). Toggle theme via `Uniwind.setTheme("light" | "dark" | "system")`.

The `useThemeColors()` hook returns the active theme's semantic tokens as a plain object — use it for RN APIs that take string `color` props (lucide icons, react-navigation tints).

## Updating from upstream HeroUI Native

When upstream HeroUI Native (`~/Code/heroui-native`) lands fixes, diff individual components against `src/components/<name>` and apply patches surgically. Mark deliberate divergences with `// chapters:` comments so future syncs are obvious.
