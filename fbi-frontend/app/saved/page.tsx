"use client";

import { useEffect, useState } from "react";
import { authFetch, saveFavourite } from "@/src/lib/api-client";
import { PagedResult, WantedPersonSummary } from "@/src/types/wanted-person";
import { Bookmark, Search } from "lucide-react";
import Link from "next/link";
import { useReportSighting } from "@/src/lib/use-report-sighting";
import { PageContainer } from "@/src/components/layout/AppShell";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Field, Input } from "@/src/components/ui/Input";
import { Button, buttonClasses } from "@/src/components/ui/Button";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { LoadingStatus } from "@/src/components/ui/Skeleton";
import { Pagination } from "@/src/components/ui/Pagination";
import { WantedCard, WantedCardSkeleton } from "@/src/components/wanted/WantedCard";

// --- PAGINA SAVED ---
export default function Saved() {
  const [data, setData] = useState<PagedResult<WantedPersonSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [favorites, setFavorites] = useState<number[]>([]);

  // --- STATE-URI MODAL HARTA ---
  const reportSighting = useReportSighting();

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
    setError(false);
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
      setError(true);
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
    reportSighting.open(person);
  };

  // --- HANDLERS PAGINARE ---
  const handlePageChange = (page: number) => { if (page >= 1 && page <= totalPages) setPageNumber(page); };
  const handlePageSizeChange = (size: number) => { setPageSize(size); setPageNumber(1); };

  return (
      <PageContainer>
          <PageHeader
            overline="Your list"
            title="Saved people"
            description="People you are keeping an eye on. Report a sighting straight from here."
          />

          {/* --- SEARCH BAR --- */}
          <div className="mb-8 max-w-2xl">
            <Field label="Search saved people" hideLabel>
              <Input
                type="search"
                placeholder="Search saved people"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </Field>
          </div>

          {/* --- GRID --- */}
          {loading ? (
             <>
                <LoadingStatus label="Loading saved people…" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
                  {Array.from({ length: 4 }, (_, i) => <WantedCardSkeleton key={i} />)}
                </div>
             </>
          ) : error ? (
             <EmptyState
                variant="error"
                title="Your saved list could not be loaded"
                description="Check your connection and try again."
                action={<Button onClick={loadData}>Try again</Button>}
             />
          ) : data?.items.length === 0 ? (
             debouncedSearch ? (
                <EmptyState
                    icon={Search}
                    title={`No saved people match “${debouncedSearch}”`}
                    action={<Button variant="secondary" onClick={() => setSearchTerm("")}>Clear search</Button>}
                />
             ) : (
                <EmptyState
                    icon={Bookmark}
                    title="Nothing saved yet"
                    description="Use the bookmark on any card in the wanted list to keep people here."
                    action={<Link href="/" className={buttonClasses("primary")}>Browse the wanted list</Link>}
                />
             )
          ) : (
            <>
                <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
                  {data?.items.map((person) => (
                    <WantedCard
                      key={person.id}
                      person={person}
                      saved={favorites.includes(person.id)}
                      onToggleSave={(e) => toggleFavorite(e, person.id)}
                      onReport={(e) => handleOpenMap(e, { id: person.id, title: person.title })}
                    />
                  ))}
                </div>

                {/* --- ZONA DE CONTROL JOS (Paginare) --- */}
                {data && data.totalCount > 0 && (
                    <Pagination
                        className="mt-12 border-t border-border pt-6"
                        page={pageNumber}
                        pageSize={pageSize}
                        total={data.totalCount}
                        onPageChange={handlePageChange}
                        onPageSizeChange={handlePageSizeChange}
                        pageSizes={[12, 24, 48]}
                        itemLabel="saved"
                    />
                )}
            </>
          )}

        {/* MODALUL DE HARTĂ */}
        {reportSighting.modal}
      </PageContainer>
  );
}
