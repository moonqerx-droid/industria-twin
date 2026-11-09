import clsx from "clsx";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong font-medium",
  secondary: "border border-line-strong bg-surface text-ink hover:border-accent",
  ghost: "text-muted hover:text-ink hover:bg-raised",
  danger: "border border-crit/50 text-crit hover:bg-crit/10",
};

const base =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] px-3.5 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  variant = "secondary",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button className={clsx(base, styles[variant], className)} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={clsx(base, styles[variant], className)}>
      {children}
    </Link>
  );
}
