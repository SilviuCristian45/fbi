"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/src/lib/api-client";
import toast, { Toaster } from "react-hot-toast";
import RouteModal from "./RouteModal";
// 👇 1. Importăm hook-ul de context (folosește calea relativă ca să nu ai erori)
import { useSignalR } from "../context/SignalRContext"; 

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

    // 👇 2. Luăm conexiunea gata făcută din AuthGuard
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
            <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-slate-900 shadow-2xl rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5 border-l-4 border-red-500`}>
                <div className="flex-1 w-0 p-4">
                    <div className="flex items-start">
                        <div className="flex-shrink-0 pt-0.5">
                            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-800">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-20"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                            </div>
                        </div>
                        <div className="ml-3 flex-1">
                            <p className="text-sm font-bold text-red-400 uppercase tracking-wider">New Intel Received</p>
                            <p className="mt-1 text-sm text-gray-300">Agent <span className="text-white font-semibold">{report.reportedBy}</span> a raportat o locație nouă!</p>
                        </div>
                    </div>
                </div>
                <div className="flex border-l border-slate-700">
                    <button onClick={() => toast.dismiss(t.id)} className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-gray-400 hover:text-white focus:outline-none">Close</button>
                </div>
            </div>
        ), { duration: 5000, position: "top-right" });
    };

    // 3. Încărcare inițială (HTTP)
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const res = await authFetch<Sighting[]>(`/FbiWanted/${wantedId}/sightings`);
                // @ts-ignore 
                const list = Array.isArray(res) ? res : res.data || [];
                setSightings(list);
            } catch (err) {
                console.error("Error loading history:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [wantedId]);

    // 🔥 4. SIGNALR OPTIMIZAT (Folosim conexiunea partajată)
    useEffect(() => {
        // Dacă conexiunea nu e gata (AuthGuard încă lucrează), așteptăm
        if (!connection) return;

        console.log("🔗 SightingsList s-a abonat la conexiunea globală.");

        // Definim handler-ul
        const handleNewLocation = (newReport: Sighting) => {
            if (newReport.wantedPersonId === Number(wantedId)) {
                setSightings(prev => [newReport, ...prev]);
                setHighlightId(newReport.id);
                playNotificationSound();
                showTacticalToast(newReport);
                setTimeout(() => setHighlightId(null), 5000);
            }
        };

        // Ne ABONĂM la eveniment
        connection.on("ReceiveLocation", handleNewLocation);

        // CLEANUP: Ne DEZABONĂM doar de la acest eveniment când ieșim de pe pagină.
        // NU oprim conexiunea (connection.stop), pentru că e folosită de AuthGuard!
        return () => {
            connection.off("ReceiveLocation", handleNewLocation);
            console.log("🔌 SightingsList s-a dezabonat.");
        };
    }, [connection, wantedId]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <Toaster />
            <RouteModal 
                isOpen={isRouteModalOpen}
                onClose={() => setIsRouteModalOpen(false)}
                locations={sightings}
                title={`Target #${wantedId}`}
            />

            <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    Live Intelligence Feed
                </h3>
                <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">Secured Channel</span>
                <button 
                    onClick={() => setIsRouteModalOpen(true)}
                    disabled={sightings.length === 0}
                    className="ml-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    View Route 🗺️
                </button>
            </div>

            <div className="max-h-[400px] overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-gray-300">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Se decriptează datele...</div>
                ) : sightings.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 italic">Nicio raportare recentă în baza de date.</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {sightings.map((report) => {
                            const isNew = report.id === highlightId;
                            return (
                                <div 
                                    key={report.id} 
                                    className={`p-4 transition-all duration-1000 ${isNew ? "bg-red-100 border-l-4 border-red-500 shadow-inner" : "hover:bg-slate-50 border-l-4 border-transparent"}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold text-sm ${isNew ? 'text-red-800' : 'text-blue-700'}`}>Agent {report.reportedBy}</span>
                                            <span className="text-xs text-gray-400">• {new Date(report.timestamp).toLocaleString()}</span>
                                            {isNew && <span className="text-xs bg-red-500 text-white px-1.5 rounded font-bold animate-pulse">NEW</span>}
                                        </div>
                                        <a 
                                            href={`https://www.google.com/maps/search/?api=1&query=${report.lat},${report.lng}`} 
                                            target="_blank" rel="noopener noreferrer"
                                            className="text-xs bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 px-2 py-1 rounded border border-gray-200 transition-colors"
                                        >
                                            Harta 🗺️
                                        </a>
                                    </div>
                                    
                                    <p className="text-gray-800 text-sm mt-2 font-medium">{report.details}</p>

                                    {/* 👇 AFISARE MEDIA */}
                                    {report.fileUrl && (
                                        <div className="mt-3 mb-2">
                                            {isVideo(report.fileUrl) ? (
                                                <div className="relative rounded-lg overflow-hidden bg-black border border-gray-300">
                                                    <video 
                                                        src={report.fileUrl} 
                                                        controls 
                                                        className="w-full h-48 object-contain"
                                                    />
                                                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider">
                                                        🎥 Video Evidence
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="relative group">
                                                    <img 
                                                        src={report.fileUrl} 
                                                        alt="Evidence" 
                                                        className="w-full h-48 object-cover rounded-lg border border-gray-300 hover:opacity-95 transition-opacity cursor-pointer"
                                                        onClick={() => window.open(report.fileUrl, '_blank')}
                                                    />
                                                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider">
                                                        📸 Photo Evidence
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-2 text-xs font-mono text-gray-500 flex gap-4">
                                        <span>LAT: {report.lat.toFixed(5)}</span>
                                        <span>LNG: {report.lng.toFixed(5)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}