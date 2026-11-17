import { useEffect, useId, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Map as MapIcon } from "lucide-react";
import { ReportItem, ReportStatus } from "../types/reports";
import RouteModal from "./RouteModal";
import { authFetch } from "../lib/api-client";
import { Sighting } from "./SightingsList";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Tabs, tabId, panelId } from "./ui/Tabs";
import { PersonPhoto } from "./wanted/PersonPhoto";
import { ReportStatusBadge, ConfidenceBar } from "./reports/ReportStatus";
import { cn } from "../lib/cn";

interface Props {
  report: ReportItem | null;
  onClose: () => void;
}

export function ReportDetailsModal({ report, onClose }: Props) {
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [, setLoading] = useState(true);
  const [tab, setTab] = useState("evidence");
  const tabsId = useId();
  const wantedId = report?.wantedId;

  useEffect(() => {
    if (wantedId === undefined) return;
    const fetchHistory = async () => {
        try {
            const res = await authFetch<Sighting[]>(`/FbiWanted/${wantedId}/sightings`);
            const list: Sighting[] = Array.isArray(res) ? (res as unknown as Sighting[]) : res.data || [];
            setSightings(list);
        } catch (err) {
            console.error("Error loading history:", err);
        } finally {
            setLoading(false);
        }
    };
    fetchHistory();
  }, [wantedId]);

  if (!report) return null;

  // On small screens the two halves become tabs; on md+ both are visible side by side.
  const panelProps = (id: string) => ({
    role: "tabpanel" as const,
    id: panelId(tabsId, id),
    "aria-labelledby": tabId(tabsId, id),
  });

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="xl"
        fill
        title={<>Analysis report <span className="font-mono text-base text-muted">#{report.id}</span></>}
        description={report.name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsRouteModalOpen(true)} disabled={sightings.length === 0}>
              <MapIcon className="size-4" aria-hidden="true" /> View route
            </Button>
            <Button onClick={onClose}>Close</Button>
          </>
        }
      >
        <div className="border-b border-border px-5 md:hidden">
          <Tabs
            idPrefix={tabsId}
            label="Report sections"
            value={tab}
            onChange={setTab}
            tabs={[{ id: "evidence", label: "Evidence" }, { id: "results", label: "AI results", count: report.matches?.length || 0 }]}
            className="border-b-0"
          />
        </div>

        {/* BODY (Split View) */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">

          {/* STÂNGA: EVIDENCE (Poza Agentului) */}
          <section
            {...panelProps("evidence")}
            className={cn("overflow-y-auto border-border bg-subtle p-5 md:w-5/12 md:border-r", tab !== "evidence" && "max-md:hidden")}
          >
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted max-md:sr-only">Submitted photo</h3>
            <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
              <PersonPhoto src={report.url} alt={`Photo submitted with report ${report.id}`} position="center" fit="contain" className="aspect-[3/4] w-full" />
            </div>
            <dl className="mt-5 grid gap-4 text-sm">
              <div>
                <dt className="font-semibold text-muted">Status</dt>
                <dd className="mt-1"><ReportStatusBadge report={report} /></dd>
              </div>
              <div>
                <dt className="font-semibold text-muted">Location</dt>
                <dd className="mt-1 font-mono">{report.latitude?.toFixed(4)}, {report.longitude?.toFixed(4)}</dd>
              </div>
              {report.description && (
                <div>
                  <dt className="font-semibold text-muted">Details</dt>
                  <dd className="mt-1 whitespace-pre-line break-words text-fg">{report.description}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* DREAPTA: AI RESULTS (Lista Scrollabilă) */}
          <section
            {...panelProps("results")}
            className={cn("flex min-h-0 flex-1 flex-col md:w-7/12", tab !== "results" && "max-md:hidden")}
          >
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 max-md:hidden">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Face analysis results</h3>
                <span className="text-sm text-muted">{report.matches?.length || 0} candidates</span>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-5">

                {/* SCENARIUL 1: PENDING */}
                {report.status === ReportStatus.Pending && (
                    <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center" role="status">
                        <Loader2 className="size-10 text-primary motion-safe:animate-spin" aria-hidden="true" />
                        <h4 className="text-lg font-bold">Analysing the photo</h4>
                        <p className="max-w-sm text-muted">
                            The face is being compared with the wanted list. This usually takes a few seconds; the list updates on its own.
                        </p>
                    </div>
                )}

                {/* SCENARIUL 2: COMPLETED dar 0 matches */}
                {report.status === ReportStatus.Completed && (!report.matches || report.matches.length === 0) && (
                    <div className="flex flex-col items-center gap-3 py-14 text-center">
                        <CheckCircle2 className="size-10 text-ok" aria-hidden="true" />
                        <h4 className="text-lg font-bold">No match in the wanted list</h4>
                        <p className="text-muted">No indexed face was similar enough to this photo.</p>
                    </div>
                )}

                {/* SCENARIUL 3: ARE MATCH-URI */}
                {report.matches && report.matches.length > 0 && (
                    <ol className="space-y-3">
                     {report.matches.map((match, idx) => (
                        <li
                            key={idx}
                            className={cn(
                                "flex gap-4 rounded-lg border p-3",
                                match.confidence > 80 ? "border-alert bg-alert-soft" : "border-border",
                            )}
                        >
                            {/* Poza FBI */}
                            <PersonPhoto src={match.url} alt={`Candidate ${idx + 1}`} className="size-20 shrink-0 rounded-md" />

                            {/* Info Match */}
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-semibold">Candidate {idx + 1}</span>
                                    <ConfidenceBar value={match.confidence} />
                                </div>
                                <a
                                  href={match.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                                >
                                  Open the source photo <ExternalLink className="size-3.5" aria-hidden="true" />
                                  <span className="sr-only">(opens in a new tab)</span>
                                </a>
                                <p className="mt-1 truncate text-xs text-muted" title={match.url}>{match.url}</p>
                            </div>
                        </li>
                    ))}
                    </ol>
                )}
             </div>
          </section>

        </div>
      </Modal>

      {/* Rendered after the report modal so it stacks on top of it. */}
      <RouteModal
         isOpen={isRouteModalOpen}
         onClose={() => setIsRouteModalOpen(false)}
         locations={sightings}
         title={`Person #${report.wantedId}`}
      />
    </>
  );
}
