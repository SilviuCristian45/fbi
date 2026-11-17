"use client";

import Link from "next/link";
import { Bookmark, MapPinPlus } from "lucide-react";
import type { WantedPersonSummary } from "@/src/types/wanted-person";
import { rewardAmount } from "@/src/lib/format";
import { cn } from "@/src/lib/cn";
import { Button } from "@/src/components/ui/Button";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { PersonPhoto } from "./PersonPhoto";

interface WantedCardProps {
  person: WantedPersonSummary;
  saved: boolean;
  onToggleSave: (e: React.MouseEvent) => void;
  onReport: (e: React.MouseEvent) => void;
}

export function WantedCard({ person, saved, onToggleSave, onReport }: WantedCardProps) {
  const href = `/wanted/${person.id}`;
  const amount = rewardAmount(person.rewardText);

  return (
    <article className="group flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-lg bg-subtle">
        {/* The title below is the accessible link; the photo link is a mouse shortcut. */}
        <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
          <PersonPhoto
            src={person.mainImageUrl}
            alt=""
            className="aspect-[4/5] w-full transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
          />
        </Link>
        <button
          type="button"
          onClick={onToggleSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${person.title} from saved` : `Save ${person.title}`}
          title={saved ? "Remove from saved" : "Save"}
          className={cn(
            "absolute right-2 top-2 grid size-10 place-items-center rounded-md border shadow-card transition-colors",
            saved ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface/95 text-fg hover:bg-surface",
          )}
        >
          <Bookmark className="size-5" fill={saved ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>

      <div className="min-w-0">
        <h2 className="text-base font-bold leading-snug sm:text-lg">
          <Link href={href} className="line-clamp-2 break-words hover:underline" title={person.title}>
            {person.title}
          </Link>
        </h2>
        {person.rewardText &&
          (amount ? (
            <p className="mt-1 text-sm font-semibold" title={person.rewardText}>
              Reward up to {amount}
            </p>
          ) : (
            <p className="mt-1 line-clamp-2 text-sm text-muted" title={person.rewardText}>
              {person.rewardText}
            </p>
          ))}
      </div>

      <Button variant="secondary" size="sm" onClick={onReport} className="mt-auto self-stretch sm:self-start">
        <MapPinPlus className="size-4" aria-hidden="true" />
        Report sighting
      </Button>
    </article>
  );
}

export function WantedCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="aspect-[4/5] w-full rounded-lg" />
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-9 w-36" />
    </div>
  );
}
