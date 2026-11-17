import { cn } from "@/src/lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface shadow-card", className)} {...props} />;
}

interface CardHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Heading level for the title (defaults to h2). */
  as?: "h2" | "h3";
  className?: string;
}

export function CardHeader({ title, description, actions, as: Heading = "h2", className }: CardHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4", className)}>
      <div className="min-w-0">
        <Heading className="text-lg font-bold tracking-tight">{title}</Heading>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
