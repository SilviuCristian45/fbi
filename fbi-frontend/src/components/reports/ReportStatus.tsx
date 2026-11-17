import { Loader2 } from "lucide-react";
import { ReportItem, ReportStatus } from "@/src/types/reports";
import { Badge, type BadgeTone } from "@/src/components/ui/Badge";
import { cn } from "@/src/lib/cn";

// Same thresholds as before: > 80% suspect found, > 50% possible match.
export function reportStatus(report: ReportItem): { tone: BadgeTone; label: string; best: number | null } {
  if (report.status === ReportStatus.Pending) return { tone: "pending", label: "Pending", best: null };
  if (report.status === ReportStatus.Failed) return { tone: "failed", label: "Analysis failed", best: null };
  if (!report.matches || report.matches.length === 0) return { tone: "completed", label: "No match", best: null };
  const best = Math.max(...report.matches.map((m) => m.confidence));
  if (best > 80) return { tone: "suspect", label: "Suspect found", best };
  if (best > 50) return { tone: "pending", label: "Possible match", best };
  return { tone: "neutral", label: "Low probability", best };
}

export function ReportStatusBadge({ report }: { report: ReportItem }) {
  const { tone, label } = reportStatus(report);
  return (
    <Badge tone={tone} icon={report.status === ReportStatus.Pending ? <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden="true" /> : undefined}>
      {label}
    </Badge>
  );
}

// Confidence bar + value; red above the suspect threshold.
export function ConfidenceBar({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
        <span className={cn("block h-full rounded-full", value > 80 ? "bg-alert" : "bg-muted")} style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      <span className={cn("font-mono text-xs", value > 80 && "font-semibold text-alert")}>{value.toFixed(1)}%</span>
    </span>
  );
}
