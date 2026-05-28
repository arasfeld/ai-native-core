import { forwardRef, type ReactNode } from "react";
import type { View } from "react-native";
import { Avatar, type AvatarImageProps, type AvatarProps } from "../avatar";
import type { TextProps } from "../text";

// Canonical "user-like" shape across Chapters. Person records from the API
// (followers, post authors, contacts) expose both Better Auth's `name`/`image`
// and Chapters' `display_name`/`avatar_url`. Profile records expose only the
// Chapters fields. UserAvatar resolves both so callers don't have to remember
// the precedence (`avatar_url ?? image`, `display_name ?? name`).
export type UserAvatarUser = {
  display_name?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  image?: string | null;
};

export type UserAvatarProps = Omit<AvatarProps, "children"> & {
  /** Person to render. Either pass this, or use the explicit overrides below. */
  user?: UserAvatarUser | null;
  /** Override the name used for initials. Wins over user fields. */
  name?: string | null;
  /** Override the image URI. Wins over user fields. */
  image?: string | null;
  /** Shown when no name resolves to non-empty initials. Defaults to "?". */
  fallback?: string;
  /** Optional Text styling for the fallback initials. */
  fallbackProps?: Pick<TextProps, "size" | "weight" | "tone" | "className">;
  /** Fires when the resolved image finishes loading. */
  onImageLoad?: AvatarImageProps["onLoad"];
  /** Fires when the resolved image fails to load — surface to users so silent R2 / network failures aren't invisible. */
  onImageError?: AvatarImageProps["onError"];
  /** Overlay nodes (e.g. loading spinner) drawn on top of the avatar. */
  children?: ReactNode;
};

function computeInitials(
  name: string | null | undefined,
  fallback: string,
): string {
  const initials = (name ?? "")
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return initials || fallback;
}

export const UserAvatar = forwardRef<View, UserAvatarProps>((props, ref) => {
  const {
    user,
    name,
    image,
    fallback = "?",
    fallbackProps,
    onImageLoad,
    onImageError,
    children,
    ...rest
  } = props;

  const resolvedName = name ?? user?.display_name ?? user?.name ?? null;
  const resolvedImage = image ?? user?.avatar_url ?? user?.image ?? null;
  const initials = computeInitials(resolvedName, fallback);

  return (
    <Avatar ref={ref} {...rest}>
      {resolvedImage ? (
        <Avatar.Image
          source={{ uri: resolvedImage }}
          onLoad={onImageLoad}
          onError={onImageError}
        />
      ) : null}
      <Avatar.Fallback {...fallbackProps}>{initials}</Avatar.Fallback>
      {children}
    </Avatar>
  );
});
UserAvatar.displayName = "UserAvatar";
