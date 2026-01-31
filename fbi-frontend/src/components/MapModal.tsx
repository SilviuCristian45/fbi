"use client";

import { useState, useEffect, DragEvent } from "react";
import dynamic from "next/dynamic";

const MapInner = dynamic(() => import("./MapInner"), { 
    ssr: false,
    loading: () => <div className="h-full w-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300">Se încarcă harta... 🌍</div>
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
  const [addressLoading, setAddressLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // State pentru efectul vizual la Drag & Drop
  const [isDragging, setIsDragging] = useState(false);

  // Reset la deschidere
  useEffect(() => {
    if (isOpen) {
        setPosition(null);
        setDetails("");
        setAddressLoading(false);
        setSelectedFile(null);
        setIsDragging(false);
    }
  }, [isOpen]);

  // Căutare adresă
  useEffect(() => {
    if (!position) return;
    const [lat, lng] = position;
    
    const fetchAddress = async () => {
        setAddressLoading(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();

            if (data && data.display_name) {
                const adresa = `📍 Adresă estimată: ${data.display_name}\n\n`;
                setDetails(prev => adresa + (prev.includes("Adresă estimată") ? prev.split("\n\n")[1] || "" : prev));
            }
        } catch (error) {
            console.error("Nu am putut găsi adresa:", error);
        } finally {
            setAddressLoading(false);
        }
    };

    const timeoutId = setTimeout(fetchAddress, 500);
    return () => clearTimeout(timeoutId);
  }, [position]);

  // --- DRAG AND DROP HANDLERS ---
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      // Validăm să fie doar imagine
      if (file.type.startsWith("image/")) {
        setSelectedFile(file);
      } else {
        alert("Te rugăm să încarci doar fișiere de tip imagine (JPG, PNG, etc).");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        // Validare suplimentară (deși input accept are image/*)
        if (file.type.startsWith("image/")) {
            setSelectedFile(file);
        }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-300 flex flex-col max-h-[95vh] transition-colors">
        
        {/* Header */}
        <div className="bg-slate-900 p-4 text-white flex justify-between items-center shrink-0">
          <h3 className="font-bold text-lg">Raportează Locație: {personName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-grow">
            
            {/* Map Body */}
            <div className="relative w-full h-80 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-700">
                <MapInner position={position} setPosition={setPosition} />
                {!position && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full text-sm font-bold shadow-md border border-yellow-200 pointer-events-none">
                        📍 Apasă pe hartă pentru a pune pinul
                    </div>
                )}
            </div>

            {/* Zona de Detalii */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900 space-y-4 transition-colors">
                <div className="flex justify-between items-center">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Detalii suplimentare
                    </label>
                    {addressLoading && <span className="text-xs text-blue-600 dark:text-blue-400 animate-pulse">Se caută adresa... 🛰️</span>}
                </div>
                
                <textarea 
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Ex: L-am văzut ieșind dintr-un magazin..."
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm min-h-[100px] resize-y 
                               bg-white dark:bg-gray-800 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                />

                {/* 👇 ZONA DE UPLOAD DRAG & DROP (DOAR IMAGINI) */}
               <div 
                   onDragOver={handleDragOver}
                   onDragLeave={handleDragLeave}
                   onDrop={handleDrop}
                   className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer group relative
                       ${isDragging 
                           ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]" 
                           : "border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                       }`}
               >
                   <label className="cursor-pointer block w-full h-full">
                       <div className="flex flex-col items-center justify-center gap-2">
                           {selectedFile ? (
                               <>
                                 <span className="text-3xl">🖼️</span>
                                 <span className="text-gray-700 dark:text-gray-200 font-bold truncate max-w-[200px]">
                                    {selectedFile.name}
                                 </span>
                                 <span className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                               </>
                           ) : (
                               <>
                                 <span className="text-3xl mb-1">{isDragging ? "📂" : "☁️"}</span>
                                 <span className="text-gray-600 dark:text-gray-400 text-sm font-semibold group-hover:text-blue-500 transition-colors">
                                     {isDragging ? "Eliberează imaginea aici!" : "Trage o poză aici sau dă click"}
                                 </span>
                                 <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                     Format suportat: JPG, PNG, GIF
                                 </span>
                               </>
                           )}
                       </div>

                       <input 
                           type="file" 
                           className="hidden" 
                           accept="image/*" // Restricție doar imagini
                           onChange={handleFileSelect}
                       />
                   </label>
                   
                   {/* Buton ștergere peste zonă */}
                   {selectedFile && (
                       <button 
                         onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedFile(null); }}
                         className="absolute top-2 right-2 p-1 bg-red-100 hover:bg-red-200 text-red-600 rounded-full transition-colors"
                         title="Șterge imaginea"
                       >
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                           <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                         </svg>
                       </button>
                   )}
              </div>
            </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white dark:bg-gray-800 flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700 shrink-0 transition-colors">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
              Anulează
          </button>
          <button 
            onClick={() => position && onSubmit(position[0], position[1], details, selectedFile)}
            disabled={!position}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-lg dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <span>Trimite Raport</span> 🚀
          </button>
        </div>
      </div>
    </div>
  );
}