import { cn } from "@/src/lib/cn";

interface PageHeaderProps {
  title: React.ReactNode;
  overline?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** "hero" is the large editorial heading used on the main list. */
  size?: "default" | "hero";
  className?: string;
}

export function PageHeader({ title, overline, description, actions, size = "default", className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-6", className)}>
      <div className="min-w-0 max-w-3xl">
        {overline && <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">{overline}</p>}
        <h1
          className={cn(
            "font-extrabold tracking-tight text-balance",
            size === "hero" ? "mt-1 text-4xl leading-[1.05] sm:text-5xl" : "mt-1 text-3xl leading-tight sm:text-4xl",
          )}
        >
          {title}
        </h1>
        {description && (
          <p className={cn("mt-3 text-muted", size === "hero" ? "text-lg" : "text-base")}>{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}
