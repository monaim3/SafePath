import Image from "next/image";
import { cn } from "./cn";

/** Shield + pin + road mark, cut from public/Images/logo.png. */
export function LogoMark({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/mark.png"
      alt=""
      width={64}
      height={64}
      priority={priority}
      className={cn("size-8 object-contain", className)}
    />
  );
}

/** Wordmark mirrors the logo: "Safe" in navy, "Path" in the green→teal gradient. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark priority />
      <span className="font-display text-xl font-extrabold tracking-tight">
        <span className="text-brand-navy dark:text-ink">Safe</span>
        <span className="text-brand">Path</span>
      </span>
    </span>
  );
}
