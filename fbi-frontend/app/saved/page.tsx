"use client";

import { useEffect, useState } from "react";
import { authFetch, saveFavourite, reportLocation, uploadFile } from "@/src/lib/api-client"; // Importam reportLocation
import { PagedResult, WantedPersonSummary } from "@/src/types/wanted-person";
import Link from "next/link";
import { Navbar } from "@/src/components/Navbar";
import MapModal from "@/src/components/MapModal"; // <--- Importam componenta noua

// --- PAGINA PRINCIPALA (Saved sau Home) ---
export default function Saved() {
  const [data, setData] = useState<PagedResult<WantedPersonSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<number[]>([]);

  // --- STATE-URI MODAL HARTA ---
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [selectedPersonForMap, setSelectedPersonForMap] = useState<{id: number, title: string} | null>(null);

  // --- STATE-URI PAGINARE & SEARCH ---
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const totalPages = data ? Math.ceil(data.totalCount / pageSize) : 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPageNumber(1); 
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        PageNumber: pageNumber.toString(),
        PageSize: pageSize.toString(),
        ...(debouncedSearch && { Search: debouncedSearch }),
      });

      // Modifică endpoint-ul dacă e pagina Saved sau Home
      const result = await authFetch<PagedResult<WantedPersonSummary>>(
        `/FbiWanted/saved?${params.toString()}` 
      );
      
      setData(result.data);
      setFavorites(result.data.items.map(it => it.id))
    } catch (error) {
      console.error("Eroare:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, pageSize, debouncedSearch]);


  const toggleFavorite = async (e: React.MouseEvent, id: number) => {
    e.preventDefault(); 
    e.stopPropagation();

    const isCurrentlyFav = favorites.includes(id);

    if (isCurrentlyFav) {
        setFavorites((prev) => prev.filter((favId) => favId !== id));
    } else {
        setFavorites((prev) => [...prev, id]);
    }

    try {
        await saveFavourite(id, !isCurrentlyFav);
    } catch (error) {
        console.error("Eroare:", error);
        // Revert logic...
    }
  };

  // --- HANDLER DESCHIDERE HARTA ---
  const handleOpenMap = (e: React.MouseEvent, person: {id: number, title: string}) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPersonForMap(person);
    setIsMapOpen(true);
  };

  // --- HANDLER TRIMITERE LOCATIE ---
  const handleSubmitLocation = async (lat: number, lng: number, details: string, file: File | null) => {
    if (!selectedPersonForMap) return;

    try {
        const fileUrl = file ? await uploadFile(file) : "no image";
        await reportLocation(selectedPersonForMap.id, lat, lng, details, fileUrl );
        alert("Locația a fost trimisă cu succes! 🕵️‍♂️");
        setIsMapOpen(false);
        setSelectedPersonForMap(null);
    } catch (error) {
        alert("Eroare la trimiterea locației.");
        console.error(error);
    }
  };

  // --- HANDLERS PAGINARE ... (la fel) ---
  const handlePrevPage = () => { if (pageNumber > 1) setPageNumber(prev => prev - 1); };
  const handleNextPage = () => { if (pageNumber < totalPages) setPageNumber(prev => prev + 1); };
  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => { setPageSize(parseInt(e.target.value)); setPageNumber(1); };

  return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          
          <Navbar />

          {/* ... SEARCH BAR ... */}

          {/* GRID */}
          {loading ? (
             <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
             </div>
          ) : (
            <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {data?.items.map((person) => {
                    const isFav = favorites.includes(person.id);

                    return (
                      <Link 
                        href={`/wanted/${person.id}`} 
                        key={person.id} 
                        className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col cursor-pointer relative"
                      >
                        <div className={`h-64 w-full relative bg-gray-200 overflow-hidden transition-all duration-300 ${isFav ? "ring-4 ring-green-500 ring-inset" : ""}`}>
                          {/* ... Imagine ... */}
                          <img src={person.mainImageUrl || '/placeholder.png'} alt={person.title} className={`w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110 ${isFav ? "grayscale-0" : ""}`} onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400x600?text=No+Image'; }} />
                          
                          {/* --- ACTION BUTTONS CONTAINER --- */}
                          <div className="absolute top-2 right-2 z-20 flex flex-col gap-2">
                              
                              {/* 1. Buton FAVORITE */}
                              <button
                                onClick={(e) => toggleFavorite(e, person.id)}
                                className="p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-white hover:scale-110 transition-all active:scale-95"
                                title="Salvează"
                              >
                                {isFav ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-red-500"><path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" /></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-500"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>
                                )}
                              </button>

                              {/* 2. Buton MAP (NOU) */}
                              <button
                                onClick={(e) => handleOpenMap(e, {id: person.id, title: person.title})}
                                className="p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-blue-50 hover:text-blue-600 hover:scale-110 transition-all active:scale-95 text-gray-600"
                                title="Raportează Locație"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                                </svg>
                              </button>
                          </div>
                        </div>

                        <div className="p-4 flex-grow">
                             <h2 className="font-bold text-lg text-gray-800 line-clamp-1">{person.title}</h2>
                             {/* ... */}
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* ... ZONA DE CONTROL JOS ... */}
            </>
          )}
        </div>

        {/* MODALUL DE HARTĂ (E pus la final, in afara loop-ului) */}
        <MapModal 
            isOpen={isMapOpen}
            onClose={() => setIsMapOpen(false)}
            onSubmit={handleSubmitLocation}
            personName={selectedPersonForMap?.title || ""}
        />

      </main>
  );
}