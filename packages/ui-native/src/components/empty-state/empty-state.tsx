import { forwardRef, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../utils/cn";
import { Heading } from "../heading";
import { Text } from "../text";

const emptyStateStyles = tv({
  slots: {
    root: "items-center gap-3 rounded-2xl border border-dashed px-6 py-12",
    iconWrap: "h-14 w-14 items-center justify-center rounded-2xl",
    title: "text-center",
    description: "text-center",
  },
  variants: {
    tone: {
      muted: {
        root: "border-border/60 bg-card/40",
        iconWrap: "bg-primary-soft",
      },
      destructive: {
        root: "border-destructive/40 bg-destructive/5",
        iconWrap: "bg-destructive/10",
      },
    },
  },
  defaultVariants: {
    tone: "muted",
  },
});

export type EmptyStateVariantProps = VariantProps<typeof emptyStateStyles>;

export type EmptyStateProps = ViewProps &
  EmptyStateVariantProps & {
    /**
     * Icon node — typically a Lucide icon. Automatically wrapped in a
     * soft-tinted rounded square. Pass `null`/omit to skip.
     */
    icon?: ReactNode;
    /** Title — rendered as `<Heading level={4}>` if a string; pass a node for custom. */
    title?: ReactNode;
    /** Supporting copy — rendered as `<Text tone="muted">` if a string. */
    description?: ReactNode;
    /** Action slot at the bottom (e.g. a `<Button>` to remediate the empty state). */
    action?: ReactNode;
  };

export const EmptyState = forwardRef<View, EmptyStateProps>((props, ref) => {
  const {
    icon,
    title,
    description,
    action,
    tone = "muted",
    className,
    ...rest
  } = props;
  const styles = emptyStateStyles({ tone });

  return (
    <View ref={ref} className={cn(styles.root(), className)} {...rest}>
      {icon ? <View className={styles.iconWrap()}>{icon}</View> : null}
      {typeof title === "string" ? (
        <Heading level={4} className={styles.title()}>
          {title}
        </Heading>
      ) : (
        title
      )}
      {typeof description === "string" ? (
        <Text
          size="sm"
          tone={tone === "destructive" ? "destructive" : "muted"}
          className={styles.description()}
        >
          {description}
        </Text>
      ) : (
        description
      )}
      {action}
    </View>
  );
});

EmptyState.displayName = "EmptyState";
