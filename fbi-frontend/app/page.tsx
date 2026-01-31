"use client";

import { useEffect, useState } from "react";
import { authFetch, saveFavourite } from "@/src/lib/api-client";
import { PagedResult, WantedPersonSummary } from "@/src/types/wanted-person";
import Link from "next/link";
import { Navbar } from "@/src/components/Navbar";
import { useRouter } from 'next/navigation'

// --- PAGINA PRINCIPALA ---
export default function Home() {
  const router = useRouter();
  const [data, setData] = useState<PagedResult<WantedPersonSummary> | null>(null);
  const [loading, setLoading] = useState(true);

  // --- STATE PENTRU FAVORITE ---
  const [favorites, setFavorites] = useState<number[]>([]);

  // --- STATE-URI PAGINARE & SEARCH ---
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const totalPages = data ? Math.ceil(data.totalCount / pageSize) : 0;

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/auth/login");
    }
  }, [router]);

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

      const result = await authFetch<PagedResult<WantedPersonSummary>>(
        `/FbiWanted?${params.toString()}`
      );

      // Încărcăm favoritele doar la prima încărcare a paginii
      if (favorites.length === 0) {
         try {
             const resultSaved = await authFetch<PagedResult<WantedPersonSummary>>(
              `/FbiWanted/saved?PageNumber=1&PageSize=1000` // Luăm mai multe ca să fim siguri că le avem pe toate pentru mapping
            );
            setFavorites(resultSaved.data.items.map(it => it.id))
         } catch (e) {
             console.log("Nu am putut incarca favoritele initiale (poate userul n-are nimic salvat)");
         }
      }
      
      setData(result.data);
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
        console.error("Eroare la salvarea favoritului:", error);
        // Revert optimisic update
        if (isCurrentlyFav) {
             setFavorites((prev) => [...prev, id]);
        } else {
             setFavorites((prev) => prev.filter((favId) => favId !== id));
        }
    }
  };

  // --- HANDLERS PAGINARE ---
  const handlePrevPage = () => {
    if (pageNumber > 1) setPageNumber(prev => prev - 1);
  };

  const handleNextPage = () => {
    if (pageNumber < totalPages) setPageNumber(prev => prev + 1);
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newSize = parseInt(e.target.value);
      setPageSize(newSize);
      setPageNumber(1);
  };

  return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          
          <Navbar />

          {/* SEARCH BAR */}
          <div className="mb-8 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            <input 
              type="text" 
              placeholder="Caută după nume sau descriere..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          {/* GRID */}
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
                        className="group bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col cursor-pointer relative"
                      >
                        {/* Container Imagine */}
                        <div className={`h-64 w-full relative bg-gray-200 dark:bg-gray-700 overflow-hidden transition-all duration-300 ${isFav ? "ring-4 ring-green-500 ring-inset" : ""}`}>
                          {/* Overlay Verde subtil dacă e favorit */}
                          {isFav && <div className="absolute inset-0 bg-green-500/20 z-10 pointer-events-none mix-blend-multiply" />}
                          
                          <img 
                            src={person.mainImageUrl || '/placeholder.png'} 
                            alt={person.title}
                            className={`w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110 ${isFav ? "grayscale-0" : ""}`}
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400x600?text=No+Image'; }}
                          />

                          {/* BUTON INIMIOARA */}
                          <button
                            onClick={(e) => toggleFavorite(e, person.id)}
                            className="absolute top-2 right-2 z-20 p-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full shadow-lg hover:bg-white dark:hover:bg-gray-700 hover:scale-110 transition-all active:scale-95"
                            title={isFav ? "Elimină din salvate" : "Salvează"}
                          >
                            {isFav ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-red-500">
                                <path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-500 dark:text-gray-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                                </svg>
                            )}
                          </button>
                        </div>

                        <div className="p-4 flex-grow">
                          <h2 className="font-bold text-lg text-gray-800 dark:text-white line-clamp-1" title={person.title}>{person.title}</h2>
                          {person.rewardText && (
                            <p className="text-sm text-green-600 dark:text-green-400 font-semibold mt-1 truncate">💰 {person.rewardText}</p>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* ZONA DE CONTROL JOS */}
                {data && data.totalCount > 0 && (
                    <div className="flex flex-col md:flex-row justify-between items-center mt-12 gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600 dark:text-gray-300">Show:</span>
                            <select 
                                value={pageSize} 
                                onChange={handlePageSizeChange}
                                className="border border-gray-300 dark:border-gray-600 rounded p-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer
                                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                <option value="12">12</option>
                                <option value="24">24</option>
                                <option value="48">48</option>
                                <option value="100">100</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-4">
                            <button 
                                onClick={handlePrevPage}
                                disabled={pageNumber === 1}
                                className="px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors"
                            >
                                &larr; Prev
                            </button>
                            
                            <span className="text-gray-700 dark:text-gray-300 font-medium text-sm">
                                Page <span className="text-blue-600 dark:text-blue-400 font-bold">{pageNumber}</span> of {totalPages}
                            </span>

                            <button 
                                onClick={handleNextPage}
                                disabled={pageNumber >= totalPages}
                                className="px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors"
                            >
                                Next &rarr;
                            </button>
                        </div>
                        
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            Total: <span className="font-semibold text-gray-900 dark:text-white">{data.totalCount}</span> records
                        </div>
                    </div>
                )}

                {data?.items.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
                        <div className="text-6xl mb-4">🔍</div>
                        <div className="text-xl font-medium">Nu am găsit rezultate pentru "{debouncedSearch}"</div>
                    </div>
                )}
            </>
          )}
        </div>
      </main>
  );
}