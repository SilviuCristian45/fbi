"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const MapInner = dynamic(() => import("./MapInner"), { 
    ssr: false,
    loading: () => <div className="h-full w-full bg-gray-200 flex items-center justify-center">Se încarcă harta... 🌍</div>
});

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (lat: number, lng: number, details: string, fileUrl: File | null) => void;
  personName: string;
}

export default function MapModal({ isOpen, onClose, onSubmit, personName }: MapModalProps) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [details, setDetails] = useState("");
  const [addressLoading, setAddressLoading] = useState(false); // Feedback vizual

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Reset la deschidere
  useEffect(() => {
    if (isOpen) {
        setPosition(null);
        setDetails("");
        setAddressLoading(false);
    }
  }, [isOpen]);

  // 🔥 EFECT NOU: Când se schimbă pinul, căutăm orașul
  useEffect(() => {
    if (!position) return;

    const [lat, lng] = position;
    
    const fetchAddress = async () => {
        setAddressLoading(true);
        try {
            // API-ul OpenStreetMap (Gratuit)
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();

            if (data && data.display_name) {
                // Adăugăm adresa la începutul detaliilor
                const adresa = `📍 Adresă estimată: ${data.display_name}\n\n`;
                // Păstrăm ce a scris userul, dacă a scris ceva
                setDetails(prev => adresa + (prev.includes("Adresă estimată") ? prev.split("\n\n")[1] || "" : prev));
            }
        } catch (error) {
            console.error("Nu am putut găsi adresa:", error);
        } finally {
            setAddressLoading(false);
        }
    };

    // Debounce mic ca să nu spamăm API-ul dacă dă click rapid
    const timeoutId = setTimeout(fetchAddress, 500);
    return () => clearTimeout(timeoutId);

  }, [position]); // Se execută când 'position' se schimbă

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-300 flex flex-col max-h-[95vh]">
        
        {/* Header */}
        <div className="bg-slate-900 p-4 text-white flex justify-between items-center shrink-0">
          <h3 className="font-bold text-lg">Raportează Locație: {personName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-grow">
            
            {/* Map Body */}
            <div className="relative w-full h-80 bg-gray-100 border-b border-gray-200">
                <MapInner position={position} setPosition={setPosition} />
                {!position && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full text-sm font-bold shadow-md border border-yellow-200 pointer-events-none">
                        📍 Apasă pe hartă pentru a pune pinul
                    </div>
                )}
            </div>

            {/* Zona de Detalii */}
            <div className="p-4 bg-gray-50 space-y-2">
                <div className="flex justify-between items-center">
                    <label className="block text-sm font-semibold text-gray-700">
                        Detalii suplimentare
                    </label>
                    {addressLoading && <span className="text-xs text-blue-600 animate-pulse">Se caută adresa... 🛰️</span>}
                </div>
                
                <textarea 
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Ex: L-am văzut ieșind dintr-un magazin..."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm min-h-[100px] resize-y text-gray-800"
                />

                {/* 👇 INPUT PENTRU FIȘIER */}
               <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-gray-100 transition-colors">
                   <label className="cursor-pointer block w-full h-full">
                       <span className="text-gray-600 text-sm font-semibold">
                           {selectedFile ? `📸 ${selectedFile.name}` : "Atașează o poză sau videoclip (Click aici)"}
                       </span>
                       <input 
                           type="file" 
                           className="hidden" 
                           accept="image/*,video/*" // Doar imagini
                           onChange={(e) => {
                               // e.target.files este o listă (FileList). Luăm primul element.
                               if (e.target.files && e.target.files.length > 0) {
                                   setSelectedFile(e.target.files[0]);
                               }
                           }}
                       />
                   </label>
                   {selectedFile && (
                       <button 
                         onClick={(e) => { e.preventDefault(); setSelectedFile(null); }}
                         className="text-xs text-red-500 mt-2 hover:underline"
                       >
                         Șterge poza
                       </button>
                   )}
              </div>
            </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white flex justify-end gap-3 border-t shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded">Anulează</button>
          <button 
            onClick={() => position && onSubmit(position[0], position[1], details, selectedFile)}
            disabled={!position}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-lg"
          >
            <span>Trimite Raport</span> 🚀
          </button>
        </div>
      </div>
    </div>
  );
}