import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-3xl border border-line bg-surface p-5 sm:p-6", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-sm font-semibold tracking-tight text-ink", className)} {...props} />;
}

export function CardHint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("mt-0.5 text-xs text-ink-3", className)} {...props} />;
}
