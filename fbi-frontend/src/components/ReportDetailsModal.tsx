import { useEffect, useState } from "react";
import { ReportItem, ReportStatus } from "../types/reports";
import RouteModal from "./RouteModal";
import { authFetch } from "../lib/api-client";
import { Sighting } from "./SightingsList";

interface Props {
  report: ReportItem | null;
  onClose: () => void;
}

export function ReportDetailsModal({ report, onClose }: Props) {
  if (!report) return null;

  // Funcție ca să închidem modalul când dăm click pe fundalul negru
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
        try {
            const res = await authFetch<Sighting[]>(`/FbiWanted/${report.wantedId}/sightings`);
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
  }, []);

  return (
    // 1. BACKDROP (Fundal întunecat)
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
          <RouteModal 
             isOpen={isRouteModalOpen}
             onClose={() => setIsRouteModalOpen(false)}
             locations={sightings}
             title={`Target #${report.wantedId}`}
          />

      {/* 2. MODAL CONTENT */}
      <div className="bg-white dark:bg-gray-800 w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 transition-colors">
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 transition-colors">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Analysis Report #{report.id}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{report.name}</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Last Known Location</p>
             <p className="text-sm text-gray-800 dark:text-gray-200"> Lat: {report.latitude?.toFixed(4)} </p>
             <p className="text-sm text-gray-800 dark:text-gray-200"> Lng: {report.longitude?.toFixed(4)} </p>
          </div>

          <div className="flex items-center gap-2">
            <button 
                    onClick={() => setIsRouteModalOpen(true)}
                    disabled={sightings.length === 0}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    View Route 🗺️
                </button>
                      
            <button 
                onClick={onClose}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 dark:text-gray-400"
            >
                ✕
            </button>
          </div>
        </div>

        {/* BODY (Split View) */}
        <div className="flex flex-col md:flex-row h-full overflow-hidden">
          
          {/* STÂNGA: EVIDENCE (Poza Agentului) */}
          <div className="w-full md:w-5/12 bg-gray-100 dark:bg-gray-900 p-6 flex flex-col items-center justify-center border-r border-gray-200 dark:border-gray-700 overflow-y-auto transition-colors">
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4 self-start">📸 Original Evidence</h3>
            <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden shadow-lg border-4 border-white dark:border-gray-700">
              <img 
                src={report.url} 
                className="w-full h-full object-cover"
                alt="Original Suspect" 
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400x600?text=No+Image'; }}
              />
            </div>
            <div className="mt-6 w-full bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-400 uppercase font-bold">Details</p>
                <p className="text-gray-800 dark:text-gray-200 mt-1 text-sm">{report.description}</p>
            </div>
          </div>

          {/* DREAPTA: AI RESULTS (Lista Scrollabilă) */}
          <div className="w-full md:w-7/12 bg-white dark:bg-gray-800 flex flex-col transition-colors">
              <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10 flex justify-between items-center">
                <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                    🤖 AI Identification Results
                </h3>
                {report.status === ReportStatus.Pending && (
                    <span className="text-xs text-blue-500 dark:text-blue-400 animate-pulse font-bold">SCANNING IN PROGRESS...</span>
                )}
              </div>

              <div className="overflow-y-auto p-4 space-y-4 flex-1">
                
                {/* SCENARIUL 1: PENDING */}
                {report.status === ReportStatus.Pending && (
                    <div className="flex flex-col items-center justify-center h-full text-center p-10 opacity-70">
                        <div className="relative w-24 h-24 mb-4">
                             <div className="absolute inset-0 border-4 border-blue-100 dark:border-blue-900 rounded-full"></div>
                             <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                             <div className="absolute inset-0 flex items-center justify-center text-4xl">🕵️‍♂️</div>
                        </div>
                        <h4 className="text-lg font-bold text-gray-700 dark:text-gray-300">Analyzing Biometrics</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                            Comparing face vectors against FBI database...<br/>
                            This usually takes 2-5 seconds.
                        </p>
                    </div>
                )}

                {/* SCENARIUL 2: COMPLETED dar 0 matches */}
                {report.status === ReportStatus.Completed && (!report.matches || report.matches.length === 0) && (
                    <div className="text-center py-20 text-gray-400 dark:text-gray-500">
                        <div className="text-4xl mb-2">✅</div>
                        <p>No matches found in the FBI database.</p>
                        <p className="text-xs mt-2">Subject appears to be a civilian.</p>
                    </div>
                )}

                {/* SCENARIUL 3: ARE MATCH-URI */}
                {report.matches && report.matches.length > 0 && (
                     report.matches.map((match, idx) => (
                        <div 
                            key={idx} 
                            className={`flex gap-4 p-4 rounded-xl border-2 transition-all ${
                                match.confidence > 80 
                                ? "border-red-100 bg-red-50/30 dark:border-red-900/30 dark:bg-red-900/10" 
                                : "border-gray-100 hover:border-blue-200 dark:border-gray-700 dark:hover:border-blue-700 dark:bg-gray-700/50"
                            }`}
                        >
                            {/* Poza FBI */}
                            <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-600 border border-gray-200 dark:border-gray-600">
                                <img 
                                    src={match.url} 
                                    className="w-full h-full object-cover"
                                    alt="FBI Record" 
                                />
                            </div>

                            {/* Info Match */}
                            <div className="flex-grow">
                                <div className="flex justify-between items-start">
                                    <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">Candidate #{idx + 1}</span>
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        match.confidence > 80 
                                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" 
                                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                    }`}>
                                            {match.confidence.toFixed(2)}% Match
                                    </span>
                                </div>
                                
                                <div className="mt-2">
                                    <p className="text-sm text-gray-600 dark:text-gray-300">Source Database Record:</p>
                                    <a href={match.url} target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline text-xs break-all line-clamp-1">
                                            {match.url}
                                    </a>
                                </div>

                                {/* Bara de progres vizuală */}
                                <div className="mt-3 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 overflow-hidden">
                                    <div 
                                            className={`h-full ${match.confidence > 80 ? "bg-red-500" : "bg-blue-500"}`} 
                                            style={{ width: `${match.confidence}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))
                )}
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}