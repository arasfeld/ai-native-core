import { forwardRef, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../utils/cn";
import { Text } from "../text";

const badgeStyles = tv({
  slots: {
    root: "flex-row items-center justify-center rounded-full",
    label: "",
  },
  variants: {
    variant: {
      primary: { root: "bg-primary", label: "text-primary-foreground" },
      secondary: { root: "bg-secondary", label: "text-secondary-foreground" },
      outline: {
        root: "bg-transparent border border-input",
        label: "text-foreground",
      },
      muted: { root: "bg-muted", label: "text-muted-foreground" },
      destructive: {
        root: "bg-destructive",
        label: "text-destructive-foreground",
      },
      "primary-soft": {
        root: "bg-primary-soft",
        label: "text-primary",
      },
      "accent-soft": {
        root: "bg-accent-soft",
        label: "text-accent",
      },
    },
    size: {
      sm: { root: "h-6 px-2 gap-1", label: "text-xs" },
      md: { root: "h-7 px-2.5 gap-1.5", label: "text-xs" },
      lg: { root: "h-8 px-3 gap-2", label: "text-sm" },
    },
  },
  defaultVariants: {
    variant: "muted",
    size: "md",
  },
});

export type BadgeVariantProps = VariantProps<typeof badgeStyles>;
export type BadgeVariant = NonNullable<BadgeVariantProps["variant"]>;
export type BadgeSize = NonNullable<BadgeVariantProps["size"]>;

export type BadgeProps = ViewProps &
  BadgeVariantProps & {
    startContent?: ReactNode;
    endContent?: ReactNode;
    children?: ReactNode;
  };

export const Badge = forwardRef<View, BadgeProps>((props, ref) => {
  const {
    variant,
    size,
    startContent,
    endContent,
    className,
    children,
    ...rest
  } = props;

  const styles = badgeStyles({ variant, size });

  const content =
    typeof children === "string" || typeof children === "number" ? (
      <Text weight="semibold" className={styles.label()}>
        {children}
      </Text>
    ) : (
      children
    );

  return (
    <View ref={ref} className={cn(styles.root(), className)} {...rest}>
      {startContent}
      {content}
      {endContent}
    </View>
  );
});

Badge.displayName = "Badge";

/** Alias — same component, exported under the alternate name for readability. */
export const Chip = Badge;
export type ChipProps = BadgeProps;
