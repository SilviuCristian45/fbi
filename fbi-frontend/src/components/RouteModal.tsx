"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

// Importăm dinamic harta pentru a evita erorile de server (Window is not defined)
const RouteMapInner = dynamic(() => import("./RouteMapInner"), { 
    ssr: false,
    loading: () => (
        <div className="h-full w-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center animate-pulse text-gray-500 dark:text-gray-400">
            Se generează traseul... 📡
        </div>
    )
});

interface RouteModalProps {
    isOpen: boolean;
    onClose: () => void;
    locations: any[]; // Poți folosi tipul Sighting aici
    title: string;
}

export default function RouteModal({ isOpen, onClose, locations, title }: RouteModalProps) {
    
    // Închide modalul cu ESC
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[80vh] transition-colors">
                
                {/* Header Modal */}
                <div className="bg-slate-900 p-4 flex justify-between items-center text-white shrink-0">
                    <div>
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            🗺️ Traseu Operativ: <span className="text-red-400">{title}</span>
                        </h3>
                        <p className="text-xs text-gray-400">{locations.length} puncte identificate</p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        ✕
                    </button>
                </div>

                {/* Harta */}
                <div className="flex-grow relative bg-gray-100 dark:bg-gray-900">
                    <RouteMapInner locations={locations} />
                </div>

                {/* Footer */}
                <div className="p-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 text-right shrink-0 transition-colors">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded hover:bg-slate-700 transition-colors shadow-lg"
                    >
                        Închide Harta
                    </button>
                </div>
            </div>
        </div>
    );
}