import { cn } from "@/src/lib/cn";

// Placeholder block for loading states; hidden from assistive tech (pair it with a status message).
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("rounded-md bg-subtle motion-safe:animate-pulse", className)} />;
}

// Screen-reader announcement for a loading region.
export function LoadingStatus({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
}
