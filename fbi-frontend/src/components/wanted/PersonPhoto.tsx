"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/src/lib/cn";

interface PersonPhotoProps {
  src?: string | null;
  alt: string;
  className?: string;
  /** object-position; FBI posters usually have the face near the top. */
  position?: "top" | "center";
  fit?: "cover" | "contain";
}

// Remote photo with a local fallback (no external placeholder service).
export function PersonPhoto({ src, alt, className, position = "top", fit = "cover" }: PersonPhotoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src;

  if (failed) {
    return (
      <div
        {...(alt ? { role: "img", "aria-label": `${alt} (no photo available)` } : { "aria-hidden": true })}
        className={cn("grid place-items-center bg-subtle text-muted", className)}
      >
        <UserRound className="size-1/3 max-h-20 max-w-20" strokeWidth={1.25} aria-hidden="true" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote fbi.gov / MinIO images, not optimized by next/image
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className={cn(fit === "cover" ? "object-cover" : "object-contain", position === "top" ? "object-top" : "object-center", className)}
    />
  );
}
