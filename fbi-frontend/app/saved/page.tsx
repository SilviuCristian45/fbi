"use client";

import { useEffect, useState } from "react";
import { authFetch, saveFavourite, reportLocation, uploadFile } from "@/src/lib/api-client";
import { PagedResult, WantedPersonSummary } from "@/src/types/wanted-person";
import Link from "next/link";
import { Navbar } from "@/src/components/Navbar";
import MapModal from "@/src/components/MapModal";

// --- PAGINA SAVED ---
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

  // --- HANDLERS PAGINARE ---
  const handlePrevPage = () => { if (pageNumber > 1) setPageNumber(prev => prev - 1); };
  const handleNextPage = () => { if (pageNumber < totalPages) setPageNumber(prev => prev + 1); };
  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => { setPageSize(parseInt(e.target.value)); setPageNumber(1); };

  return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          
          <Navbar />

          {/* --- SEARCH BAR --- */}
          <div className="my-8 relative max-w-2xl mx-auto">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
            </div>
            <input
                type="text"
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl leading-5 
                           bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm shadow-sm transition-all
                           dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:ring-blue-400"
                placeholder="Search saved fugitives..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* --- GRID --- */}
          {loading ? (
             <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
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
                        // Card Styles: Light vs Dark
                        className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col cursor-pointer relative
                                   dark:bg-gray-800 dark:border-gray-700 dark:hover:shadow-gray-900/50"
                      >
                        <div className={`h-64 w-full relative bg-gray-200 dark:bg-gray-700 overflow-hidden transition-all duration-300 ${isFav ? "ring-4 ring-green-500 ring-inset" : ""}`}>
                          {/* ... Imagine ... */}
                          <img 
                            src={person.mainImageUrl || '/placeholder.png'} 
                            alt={person.title} 
                            className={`w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110 ${isFav ? "grayscale-0" : ""}`} 
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400x600?text=No+Image'; }} 
                          />
                          
                          {/* --- ACTION BUTTONS CONTAINER --- */}
                          <div className="absolute top-2 right-2 z-20 flex flex-col gap-2">
                              
                              {/* 1. Buton FAVORITE */}
                              <button
                                onClick={(e) => toggleFavorite(e, person.id)}
                                className="p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-white hover:scale-110 transition-all active:scale-95
                                           dark:bg-gray-800/90 dark:hover:bg-gray-700"
                                title="Salvează"
                              >
                                {isFav ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-red-500"><path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" /></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-500 dark:text-gray-300"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>
                                )}
                              </button>

                              {/* 2. Buton MAP */}
                              <button
                                onClick={(e) => handleOpenMap(e, {id: person.id, title: person.title})}
                                className="p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-blue-50 hover:text-blue-600 hover:scale-110 transition-all active:scale-95 text-gray-600
                                           dark:bg-gray-800/90 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-blue-400"
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
                             {/* Titlu: Negru pe light, Alb pe dark */}
                             <h2 className="font-bold text-lg text-gray-800 line-clamp-1 dark:text-white">{person.title}</h2>
                             {/* Detalii secundare (opțional) */}
                           
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* --- ZONA DE CONTROL JOS (Paginare) --- */}
                {data && data.totalCount > 0 && (
                    <div className="mt-8 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100
                                    dark:bg-gray-800 dark:border-gray-700">
                        
                        {/* Selector Rows */}
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                            <span>Rows per page:</span>
                            <select 
                                value={pageSize} 
                                onChange={handlePageSizeChange} 
                                className="border border-gray-300 rounded p-1 text-sm bg-white focus:ring-blue-500 focus:border-blue-500
                                           dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            >
                                <option value={12}>12</option>
                                <option value={24}>24</option>
                                <option value={48}>48</option>
                            </select>
                            <span className="ml-2">
                                Showing {((pageNumber - 1) * pageSize) + 1} - {Math.min(pageNumber * pageSize, data.totalCount)} of {data.totalCount}
                            </span>
                        </div>

                        {/* Butoane Navigare */}
                        <div className="flex gap-2">
                            <button 
                                onClick={handlePrevPage} 
                                disabled={pageNumber === 1}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition
                                           dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600"
                            >
                                Previous
                            </button>
                            <button 
                                onClick={handleNextPage} 
                                disabled={pageNumber === totalPages}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md
                                           dark:bg-blue-600 dark:hover:bg-blue-500"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </>
          )}
        </div>

        {/* MODALUL DE HARTĂ */}
        <MapModal 
            isOpen={isMapOpen}
            onClose={() => setIsMapOpen(false)}
            onSubmit={handleSubmitLocation}
            personName={selectedPersonForMap?.title || ""}
        />

      </main>
  );
}