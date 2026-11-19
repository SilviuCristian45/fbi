import { cn } from "@/src/lib/cn";

export type BadgeTone = "pending" | "completed" | "suspect" | "failed" | "neutral" | "primary";

const tones: Record<BadgeTone, string> = {
  pending: "bg-pending-soft text-pending",
  completed: "bg-ok-soft text-ok",
  suspect: "bg-alert text-alert-fg",
  failed: "bg-subtle text-muted border border-border",
  neutral: "bg-subtle text-fg border border-border",
  primary: "bg-primary-soft text-primary",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: React.ReactNode;
}

// Status label. Text carries the meaning; color only reinforces it.
export function Badge({ tone = "neutral", icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-bold uppercase leading-none tracking-wide whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

// Pill used for subjects and filters (not a status).
export function Chip({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium", className)}
      {...props}
    />
  );
}
