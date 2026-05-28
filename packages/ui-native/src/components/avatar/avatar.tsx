import { Image as ExpoImage, type ImageProps } from "expo-image";
import {
  createContext,
  forwardRef,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type Text as RNText, View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { withUniwind } from "uniwind";
import { cn } from "../../utils/cn";
import { Text, type TextProps } from "../text";

// expo-image is a third-party component, so its `className` prop is NOT
// compiled by Uniwind out of the box — we have to wrap it once at module
// level. Without this, classes like `absolute inset-0 h-full w-full` are
// silently dropped and the image renders at zero size, leaving only the
// fallback visible. See https://docs.uniwind.dev/ — "Styling Third-Party
// Components" → withUniwind.
const Image = withUniwind(ExpoImage);

const avatarStyles = tv({
  base: "items-center justify-center overflow-hidden rounded-full bg-primary-soft",
  variants: {
    size: {
      xs: "h-6 w-6",
      sm: "h-8 w-8",
      md: "h-10 w-10",
      lg: "h-12 w-12",
      xl: "h-16 w-16",
    },
  },
  defaultVariants: { size: "md" },
});

export type AvatarSize = NonNullable<VariantProps<typeof avatarStyles>["size"]>;

type AvatarImageStatus = "loading" | "loaded" | "error";

type AvatarContextValue = {
  size: AvatarSize;
  status: AvatarImageStatus;
  setStatus: (next: AvatarImageStatus) => void;
};

const AvatarContext = createContext<AvatarContextValue | null>(null);

function useAvatarContext(): AvatarContextValue {
  const ctx = useContext(AvatarContext);
  if (!ctx)
    throw new Error("Avatar subcomponents must be used inside <Avatar>");
  return ctx;
}

export type AvatarProps = ViewProps & {
  size?: AvatarSize;
  children?: ReactNode;
};

const AvatarRoot = forwardRef<View, AvatarProps>((props, ref) => {
  const { size = "md", className, children, ...rest } = props;
  const [status, setStatus] = useState<AvatarImageStatus>("loading");

  const value = useMemo<AvatarContextValue>(
    () => ({ size, status, setStatus }),
    [size, status],
  );

  return (
    <AvatarContext.Provider value={value}>
      <View
        ref={ref}
        className={cn(avatarStyles({ size }), className)}
        {...rest}
      >
        {children}
      </View>
    </AvatarContext.Provider>
  );
});
AvatarRoot.displayName = "Avatar";

export type AvatarImageProps = Omit<ImageProps, "source"> & {
  source: ImageProps["source"];
};

// Radix/shadcn overlay pattern: image absolute over the fallback, fallback
// stays mounted until status === 'loaded', failed loads keep the fallback
// visible (status → 'error'). expo-image's `transition` prop handles the
// fade-in so we don't need Reanimated. Note: the wrapped `Image` above is
// required — without `withUniwind`, expo-image silently drops className
// and the image renders at zero size.
//
// We reset status → 'loading' whenever the source URI changes (so the
// fallback shows during the new load) and on unmount (so a parent that
// goes from "has image" → "no image" doesn't leave the avatar stuck in
// 'loaded' with neither image nor fallback visible).
function sourceKey(source: ImageProps["source"]): string {
  if (!source) return "";
  if (typeof source === "string") return source;
  if (typeof source === "number") return String(source);
  if (Array.isArray(source)) return source.map(sourceKey).join("|");
  return (source as { uri?: string }).uri ?? "";
}

const AvatarImage = forwardRef<ExpoImage, AvatarImageProps>((props, ref) => {
  const {
    onLoad,
    onError,
    style,
    className,
    transition,
    contentFit,
    source,
    ...rest
  } = props;
  const { setStatus } = useAvatarContext();
  const key = sourceKey(source);

  useEffect(() => {
    setStatus("loading");
    return () => setStatus("loading");
  }, [key, setStatus]);

  return (
    <Image
      ref={ref}
      source={source}
      onLoad={(event) => {
        setStatus("loaded");
        onLoad?.(event);
      }}
      onError={(event) => {
        setStatus("error");
        console.warn("[Avatar.Image] failed to load", source, event);
        onError?.(event);
      }}
      transition={transition ?? 150}
      contentFit={contentFit ?? "cover"}
      className={cn("absolute inset-0 h-full w-full", className)}
      style={style}
      {...rest}
    />
  );
});
AvatarImage.displayName = "Avatar.Image";

export type AvatarFallbackProps = TextProps;

// Always rendered unless we've confirmed the image has actually painted
// (status === 'loaded'). The image overlays it via absolute positioning,
// so during loading the fallback shows through behind the still-transparent
// image, and on error the fallback stays visible.
const AvatarFallback = forwardRef<RNText, AvatarFallbackProps>((props, ref) => {
  const { size, status } = useAvatarContext();
  if (status === "loaded") return null;

  const fallbackSize: TextProps["size"] =
    size === "xs" || size === "sm" ? "xs" : size === "md" ? "sm" : "base";

  const {
    size: sizeProp,
    weight = "semibold",
    tone = "primary",
    className,
    ...rest
  } = props;

  return (
    <Text
      ref={ref}
      size={sizeProp ?? fallbackSize}
      weight={weight}
      tone={tone}
      className={className}
      {...rest}
    />
  );
});
AvatarFallback.displayName = "Avatar.Fallback";

export const Avatar = Object.assign(AvatarRoot, {
  Image: AvatarImage,
  Fallback: AvatarFallback,
});
