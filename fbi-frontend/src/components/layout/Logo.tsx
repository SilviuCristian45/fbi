import Link from "next/link";
import { cn } from "@/src/lib/cn";

// Sightline wordmark: a teal tile with an open ring ("sight"), no agency insignia.
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-fg", className)}>
      <span aria-hidden="true" className="relative grid size-7 place-items-center rounded-md bg-primary">
        <span className="size-3 rounded-full border-[2.5px] border-primary-fg" />
      </span>
      Sightline
    </Link>
  );
}
