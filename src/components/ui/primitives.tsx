import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "ghost" | "outline" | "danger";
  size?: "md" | "lg" | "sm";
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
        size === "lg" && "h-14 px-6 text-base",
        size === "md" && "h-12 px-5 text-sm",
        size === "sm" && "h-9 px-3 text-xs",
        variant === "primary" && "bg-primary text-primary-foreground glow-primary",
        variant === "accent" && "bg-accent text-accent-foreground",
        variant === "ghost" && "bg-secondary text-secondary-foreground",
        variant === "outline" && "border border-border bg-transparent text-foreground",
        variant === "danger" && "bg-destructive text-destructive-foreground",
        className,
      )}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn("surface rounded-3xl border border-border/70 p-4 shadow-lg/20", className)}
    />
  );
}

export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "accent" | "danger" | "success";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
        tone === "muted" && "bg-secondary text-muted-foreground",
        tone === "primary" && "bg-primary/20 text-primary",
        tone === "accent" && "bg-accent/20 text-accent",
        tone === "danger" && "bg-destructive/20 text-destructive",
        tone === "success" && "bg-success/20 text-success",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-3 px-1 pt-2">
      <div>
        <h1 className="font-display text-2xl font-extrabold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {right}
    </header>
  );
}

export function Avatar({ emoji, name, size = 44 }: { emoji: string; name?: string; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center justify-center rounded-2xl bg-secondary text-xl"
        style={{ width: size, height: size }}
      >
        {emoji}
      </div>
      {name ? <span className="max-w-16 truncate text-[11px] text-muted-foreground">{name}</span> : null}
    </div>
  );
}
