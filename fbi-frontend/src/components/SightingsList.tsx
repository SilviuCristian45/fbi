"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/src/lib/api-client";
import toast from "react-hot-toast";
import { ExternalLink, Map as MapIcon, Video } from "lucide-react";
import RouteModal from "./RouteModal";
import { useSignalR } from "../context/SignalRContext";
import { AlertToast } from "./ui/Toast";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Skeleton, LoadingStatus } from "./ui/Skeleton";
import { EmptyState } from "./ui/EmptyState";
import { formatDateTime } from "../lib/format";
import { cn } from "../lib/cn";

export interface Sighting {
    id: number;
    lat: number;
    lng: number;
    details: string;
    reportedBy: string;
    timestamp: string;
    wantedPersonId: number;
    fileUrl: string;
}

export default function SightingsList({ wantedId }: { wantedId: number }) {
    const [sightings, setSightings] = useState<Sighting[]>([]);
    const [loading, setLoading] = useState(true);
    const [highlightId, setHighlightId] = useState<number | null>(null);
    const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);

    const { connection } = useSignalR(); 

    // Helper: Verifică dacă e video
    const isVideo = (url: string) => {
        if (!url) return false;
        const ext = url.split('.').pop()?.toLowerCase();
        return ['mp4', 'mov', 'webm', 'ogg', 'avi'].includes(ext || '');
    };

    const playNotificationSound = () => {
        try {
            const audio = new Audio("../../sounds/notif.wav");
            audio.volume = 0.5;
            audio.play().catch((e) => console.log("Audio autoplay blocked", e));
        } catch (error) {
            console.error("Audio error", error);
        }
    };

    const showTacticalToast = (report: Sighting) => {
        toast.custom((t) => (
            <AlertToast t={t} title="New sighting reported">
                <span className="font-semibold text-fg">{report.reportedBy}</span> reported a new location for this person.
            </AlertToast>
        ), { duration: 5000, position: "top-right" });
    };

    // 3. Încărcare inițială (HTTP)
    useEffect(() => {
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

    // 🔥 4. SIGNALR OPTIMIZAT
    useEffect(() => {
        if (!connection) return;

        const handleNewLocation = (newReport: Sighting) => {
            if (newReport.wantedPersonId === Number(wantedId)) {
                setSightings(prev => [newReport, ...prev]);
                setHighlightId(newReport.id);
                playNotificationSound();
                showTacticalToast(newReport);
                setTimeout(() => setHighlightId(null), 5000);
            }
        };

        connection.on("ReceiveLocation", handleNewLocation);

        return () => {
            connection.off("ReceiveLocation", handleNewLocation);
        };
    }, [connection, wantedId]);

    return (
        <Card className="overflow-hidden">
            <RouteModal
                isOpen={isRouteModalOpen}
                onClose={() => setIsRouteModalOpen(false)}
                locations={sightings}
                title={`Person #${wantedId}`}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold tracking-tight">Sightings</h2>
                    {!loading && <Badge tone="neutral">{sightings.length}</Badge>}
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsRouteModalOpen(true)}
                    disabled={sightings.length === 0}
                >
                    <MapIcon className="size-4" aria-hidden="true" /> View route
                </Button>
            </div>

            <div className="max-h-[560px] overflow-y-auto" aria-live="polite">
                {loading ? (
                    <div className="grid gap-4 p-5">
                        <LoadingStatus label="Loading sightings…" />
                        {[0, 1].map(i => (
                            <div key={i} className="grid gap-2">
                                <Skeleton className="h-4 w-1/2" />
                                <Skeleton className="h-4 w-4/5" />
                                <Skeleton className="h-32 w-full" />
                            </div>
                        ))}
                    </div>
                ) : sightings.length === 0 ? (
                    <EmptyState
                        className="py-10"
                        icon={MapIcon}
                        title="No sightings yet"
                        description="Seen this person? Use “Report a sighting” on this page."
                    />
                ) : (
                    <ol className="divide-y divide-border">
                        {sightings.map((report) => {
                            const isNew = report.id === highlightId;
                            return (
                                <li
                                    key={report.id}
                                    className={cn(
                                        "border-l-4 px-5 py-4 transition-colors duration-700",
                                        isNew ? "border-l-alert bg-alert-soft" : "border-l-transparent",
                                    )}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-semibold">
                                                {report.reportedBy}
                                                {isNew && <Badge tone="suspect" className="ml-2 align-middle">New</Badge>}
                                            </p>
                                            <p className="text-sm text-muted"><time dateTime={report.timestamp}>{formatDateTime(report.timestamp)}</time></p>
                                        </div>
                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${report.lat},${report.lng}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                                        >
                                            Open in maps <ExternalLink className="size-3.5" aria-hidden="true" />
                                            <span className="sr-only">(opens in a new tab)</span>
                                        </a>
                                    </div>

                                    {report.details && <p className="mt-2 whitespace-pre-line break-words">{report.details}</p>}

                                    {/* 👇 AFISARE MEDIA */}
                                    {report.fileUrl && (
                                        <div className="mt-3">
                                            {isVideo(report.fileUrl) ? (
                                                <div className="relative overflow-hidden rounded-md border border-border bg-black">
                                                    <video
                                                        src={report.fileUrl}
                                                        controls
                                                        className="h-48 w-full object-contain"
                                                    />
                                                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-sm bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
                                                        <Video className="size-3" aria-hidden="true" /> Video
                                                    </span>
                                                </div>
                                            ) : (
                                                <a href={report.fileUrl} target="_blank" rel="noopener noreferrer" className="block" aria-label="Open the sighting photo in a new tab">
                                                    {/* eslint-disable-next-line @next/next/no-img-element -- uploaded evidence served from the file API */}
                                                    <img
                                                        src={report.fileUrl}
                                                        alt={`Photo from the sighting reported by ${report.reportedBy}`}
                                                        className="h-48 w-full rounded-md border border-border object-cover transition-opacity hover:opacity-90"
                                                    />
                                                </a>
                                            )}
                                        </div>
                                    )}

                                    <p className="mt-2 font-mono text-xs text-muted">
                                        {report.lat.toFixed(5)}, {report.lng.toFixed(5)}
                                    </p>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
        </Card>
    );
}
