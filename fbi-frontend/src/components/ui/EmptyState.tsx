import { AlertTriangle, SearchX, type LucideIcon } from "lucide-react";
import { cn } from "@/src/lib/cn";

interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: LucideIcon;
  /** "error" uses the alert color and is announced (role="alert"). */
  variant?: "empty" | "error";
  className?: string;
}

export function EmptyState({ title, description, action, icon, variant = "empty", className }: EmptyStateProps) {
  const Icon = icon ?? (variant === "error" ? AlertTriangle : SearchX);
  return (
    <div
      role={variant === "error" ? "alert" : undefined}
      className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}
    >
      <span
        className={cn(
          "grid size-12 place-items-center rounded-full",
          variant === "error" ? "bg-alert-soft text-alert" : "bg-subtle text-muted",
        )}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="max-w-md text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
