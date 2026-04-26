"use client";

import { cn } from "@repo/ui/lib/utils";
import { motion } from "motion/react";
import type { HTMLAttributes } from "react";

export type CursorProps = HTMLAttributes<HTMLSpanElement>;

export function Cursor({ className, ...props }: CursorProps) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      className={cn(
        "inline-block h-[1em] w-0.5 translate-y-[0.1em] bg-primary",
        className,
      )}
      initial={{ opacity: 1 }}
      transition={{
        duration: 0.8,
        repeat: Number.POSITIVE_INFINITY,
        ease: "easeInOut",
      }}
      {...(props as any)}
    />
  );
}
