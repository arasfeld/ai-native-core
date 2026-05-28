import { forwardRef, type ReactNode } from "react";
import { type Text as RNText, View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../utils/cn";
import {
  Surface,
  type SurfaceProps,
  type SurfaceVariantProps,
} from "../surface";
import { Text, type TextProps } from "../text";

const cardStyles = tv({
  slots: {
    root: "p-4",
    header: "flex-row items-center gap-2",
    body: "gap-1",
    footer: "flex-row items-center gap-2",
    title: "",
    description: "",
  },
});

export type CardVariantProps = SurfaceVariantProps;

export type CardProps = SurfaceProps & {
  children?: ReactNode;
};

const CardRoot = forwardRef<View, CardProps>((props, ref) => {
  const { className, children, variant, radius, ...rest } = props;
  const styles = cardStyles();

  return (
    <Surface
      ref={ref}
      variant={variant}
      radius={radius}
      className={cn(styles.root(), className)}
      {...rest}
    >
      {children}
    </Surface>
  );
});

CardRoot.displayName = "Card";

export type CardHeaderProps = ViewProps & { children?: ReactNode };

const CardHeader = forwardRef<View, CardHeaderProps>((props, ref) => {
  const { className, children, ...rest } = props;
  const styles = cardStyles();
  return (
    <View ref={ref} className={cn(styles.header(), className)} {...rest}>
      {children}
    </View>
  );
});
CardHeader.displayName = "Card.Header";

export type CardBodyProps = ViewProps & { children?: ReactNode };

const CardBody = forwardRef<View, CardBodyProps>((props, ref) => {
  const { className, children, ...rest } = props;
  const styles = cardStyles();
  return (
    <View ref={ref} className={cn(styles.body(), className)} {...rest}>
      {children}
    </View>
  );
});
CardBody.displayName = "Card.Body";

export type CardFooterProps = ViewProps & { children?: ReactNode };

const CardFooter = forwardRef<View, CardFooterProps>((props, ref) => {
  const { className, children, ...rest } = props;
  const styles = cardStyles();
  return (
    <View ref={ref} className={cn(styles.footer(), className)} {...rest}>
      {children}
    </View>
  );
});
CardFooter.displayName = "Card.Footer";

export type CardTitleProps = TextProps;

const CardTitle = forwardRef<RNText, CardTitleProps>((props, ref) => {
  const { className, weight = "semibold", size = "lg", ...rest } = props;
  const styles = cardStyles();
  return (
    <Text
      ref={ref}
      size={size}
      weight={weight}
      className={cn(styles.title(), className)}
      {...rest}
    />
  );
});
CardTitle.displayName = "Card.Title";

export type CardDescriptionProps = TextProps;

const CardDescription = forwardRef<RNText, CardDescriptionProps>(
  (props, ref) => {
    const { className, tone = "muted", size = "sm", ...rest } = props;
    const styles = cardStyles();
    return (
      <Text
        ref={ref}
        size={size}
        tone={tone}
        className={cn(styles.description(), className)}
        {...rest}
      />
    );
  },
);
CardDescription.displayName = "Card.Description";

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
  Title: CardTitle,
  Description: CardDescription,
});

export type CardSlotStyles = VariantProps<typeof cardStyles>;
