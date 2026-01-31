"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authFetchFile, getWantedPersonById } from "@/src/lib/api-client";
import { WantedPersonDetail } from "@/src/types/wanted-person";
import Link from "next/link";
import SightingsList from "@/src/components/SightingsList";

export default function WantedDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  
  const [person, setPerson] = useState<WantedPersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string>("");

  const exportPdf = async () => {
    if (!person || !id) return;

    try {
        const response = await authFetchFile(`FbiWanted/${id}/dossier`, {
            method: 'GET',
        });

        if (!response.ok) throw new Error("Download failed");

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CASE_FILE_${person.title.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
    } catch (error) {
        alert("Eroare la generarea dosarului!");
        console.error(error);
    }
  }

  useEffect(() => {
    const loadPerson = async () => {
      if (!id) return;
      
      try {
        const result = await getWantedPersonById(id as string);
        setPerson(result.data);
        if (result.data.images && result.data.images.length > 0) {
          setSelectedImage(result.data.images[0]);
        }
      } catch (error) {
        console.error("Nu am găsit persoana:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPerson();
  }, [id]);

  if (loading) {
    return (
        <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors">
           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
        </div>
    );
  }

  if (!person) {
    return <div className="p-10 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 min-h-screen">Persoana nu a fost găsită.</div>;
  }

  return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          
          {/* Buton Back */}
          <Link href="/" className="inline-flex items-center text-blue-600 hover:underline mb-6 font-medium dark:text-blue-400">
            &larr; Înapoi la listă
          </Link>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden mb-10 transition-colors">
            
            {/* Header cu Titlu */}
            <div className="bg-slate-900 p-6 text-white border-b border-slate-800 relative overflow-hidden">
              {/* Optional: Background Pattern */}
              <div className="absolute top-0 right-0 p-4 opacity-10">
                 <img src="/fbi-seal.png" className="w-32 h-32 grayscale" onError={(e) => e.currentTarget.style.display = 'none'} />
              </div>

              <h1 className="text-3xl md:text-4xl font-bold text-center uppercase tracking-wide text-red-500 drop-shadow-sm relative z-10">
                {person.title}
              </h1>
              {person.subjects && person.subjects.length > 0 && (
                 <div className="flex flex-wrap justify-center gap-2 mt-4 relative z-10">
                    {person.subjects.map(sub => (
                        <span key={sub} className="bg-gray-700 border border-gray-600 px-3 py-1 rounded-full text-xs font-bold uppercase text-gray-200">
                            {sub}
                        </span>
                    ))}
                 </div>
              )}

             <div className="flex justify-center mt-6 relative z-10">
                  <button 
                    onClick={exportPdf}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-6 py-3 rounded shadow-lg hover:shadow-red-500/20 transition-all transform hover:-translate-y-0.5 border border-red-500"
                  > 
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625z" />
                      <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
                    </svg>
                    DOWNLOAD OFFICIAL DOSSIER (PDF)
                  </button>
              </div>

            </div>

            {/* SECȚIUNEA 1: POZE ȘI DETALII FIZICE (TOP) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 p-6 md:p-8 bg-white dark:bg-gray-800 transition-colors">
              
              {/* STÂNGA: Galerie Foto */}
              <div className="lg:col-span-1 space-y-4">
                {/* Imaginea Mare */}
                <div className="aspect-[3/4] w-full bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 relative">
                    <img 
                        src={selectedImage || '/placeholder.png'} 
                        alt={person.title}
                        className="w-full h-full object-contain bg-neutral-900"
                    />
                      {person.rewardText && (
                        <div className="absolute bottom-0 left-0 right-0 bg-green-600/90 text-white text-center py-2 font-bold backdrop-blur-sm">
                            REWARD: {person.rewardText}
                        </div>
                      )}
                </div>

                {/* Thumbnails */}
                {person.images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
                        {person.images.map((img, idx) => (
                            <button 
                                key={idx}
                                onClick={() => setSelectedImage(img)}
                                className={`w-16 h-16 flex-shrink-0 rounded border-2 overflow-hidden transition-all 
                                            ${selectedImage === img ? 'border-red-500 opacity-100' : 'border-gray-200 dark:border-gray-600 opacity-60 hover:opacity-100'}`}
                            >
                                <img src={img} className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}
              </div>

              {/* DREAPTA: Statistici și Detalii Fizice */}
              <div className="lg:col-span-2">
                 <h3 className="text-gray-900 dark:text-white font-bold text-xl border-b border-gray-200 dark:border-gray-700 pb-2 mb-4 flex items-center gap-2">
                    📊 Physical Identification
                 </h3>
                 
                 <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
                    <DetailItem label="Sex" value={person.sex} />
                    <DetailItem label="Race" value={person.race} />
                
                    <DetailItem label="Hair" value={person.hair} />
                    <DetailItem label="Eyes" value={person.eyes} />
                    
                   
                 </div>

                 {/* Alias-uri */}
                 {person.aliases && person.aliases.length > 0 && (
                    <div>
                        <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Known Aliases</h4>
                        <div className="flex flex-wrap gap-2">
                            {person.aliases.map((alias, i) => (
                                <span key={i} className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1 rounded text-sm font-mono border border-gray-200 dark:border-gray-600">
                                    {alias}
                                </span>
                            ))}
                        </div>
                    </div>
                 )}
              </div>
            </div>

            {/* SECȚIUNEA 2: DESCRIERE COMPLEXĂ ȘI LIVE FEED (BOTTOM) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 p-6 md:p-8 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                
                {/* STÂNGA (2/3): Descriere Text și Caution */}
                <div className="lg:col-span-2 space-y-8">
                      
                      {/* Caution / Remarks */}
                      {(person.caution || person.details) && (
                        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-600 p-6 rounded-r-lg shadow-sm">
                            <h3 className="text-red-700 dark:text-red-400 font-bold text-lg mb-3 flex items-center gap-2 uppercase tracking-wider">
                                ⚠️ Caution / Remarks
                            </h3>
                            <div 
                                className="prose prose-sm text-gray-800 dark:text-gray-300 max-w-none"
                                dangerouslySetInnerHTML={{ __html: person.caution || person.details || "" }} 
                            />
                        </div>
                     )}

                    {/* Descriere Textuală */}
                    {person.description && (
                        <div>
                            <h3 className="text-gray-900 dark:text-white font-bold text-xl mb-3">Case Details</h3>
                            <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                                {person.description}
                            </p>
                        </div>
                    )}
                </div>

                {/* DREAPTA (1/3): LIVE INTEL FEED */}
                <div className="lg:col-span-1">
                    <div className="sticky top-6">
                        <SightingsList wantedId={person.id} />
                        
                        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
                            Datele sunt criptate și accesibile doar personalului autorizat.<br/>
                            Folosiți butonul "Raportează" din lista principală pentru a adăuga informații noi.
                        </div>
                    </div>
                </div>

            </div>

          </div>
        </div>
      </main>
  );
}

// Helper pentru tabel (Actualizat cu Dark Mode)
function DetailItem({ label, value, fullWidth = false }: { label: string, value?: string, fullWidth?: boolean }) {
    if (!value) return null;
    return (
        <div className={`bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600 shadow-sm transition-colors ${fullWidth ? 'col-span-2 sm:col-span-3' : ''}`}>
            <span className="block text-xs text-gray-400 dark:text-gray-400 uppercase font-bold mb-1">{label}</span>
            <span className="text-gray-900 dark:text-white font-semibold text-sm">{value}</span>
        </div>
    )
}