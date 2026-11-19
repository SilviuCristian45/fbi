"use client";

import { useEffect, useState } from "react";
import { authFetch, saveFavourite } from "@/src/lib/api-client";
import { PagedResult, WantedPersonSummary } from "@/src/types/wanted-person";
import { useRouter } from 'next/navigation'
import { Search } from "lucide-react";
import { useReportSighting } from "@/src/lib/use-report-sighting";
import { formatCount } from "@/src/lib/format";
import { PageContainer } from "@/src/components/layout/AppShell";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Field, Input } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { LoadingStatus } from "@/src/components/ui/Skeleton";
import { Pagination } from "@/src/components/ui/Pagination";
import { WantedCard, WantedCardSkeleton } from "@/src/components/wanted/WantedCard";

// --- PAGINA PRINCIPALA ---
export default function Home() {
  const router = useRouter();
  const [data, setData] = useState<PagedResult<WantedPersonSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // --- STATE PENTRU FAVORITE ---
  const [favorites, setFavorites] = useState<number[]>([]);
  const reportSighting = useReportSighting();

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
    setError(false);
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
         } catch {
             console.log("Nu am putut incarca favoritele initiale (poate userul n-are nimic salvat)");
         }
      }

      setData(result.data);
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
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) setPageNumber(page);
  };

  const handlePageSizeChange = (size: number) => {
      setPageSize(size);
      setPageNumber(1);
  };

  return (
      <PageContainer>
          <PageHeader
            size="hero"
            overline={data ? `${formatCount(data.totalCount)} people on the public wanted list` : "Public wanted list"}
            title="Have you seen any of these people?"
            description="If you recognise someone, report where and when you saw them. A photo helps: it is compared automatically with the list."
          />

          {/* SEARCH BAR */}
          <div className="mb-8 max-w-2xl">
            <Field label="Search the wanted list" hideLabel>
              <Input
                type="search"
                placeholder="Search by name or description"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-12"
              />
            </Field>
          </div>

          {/* GRID */}
          {loading ? (
             <>
                <LoadingStatus label="Loading the wanted list…" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
                  {Array.from({ length: Math.min(pageSize, 12) }, (_, i) => <WantedCardSkeleton key={i} />)}
                </div>
             </>
          ) : error ? (
             <EmptyState
                variant="error"
                title="The wanted list could not be loaded"
                description="Check your connection and try again."
                action={<Button onClick={loadData}>Try again</Button>}
             />
          ) : (
            <>
                {data?.items.length === 0 ? (
                    <EmptyState
                        icon={Search}
                        title={debouncedSearch ? `No results for “${debouncedSearch}”` : "The list is empty"}
                        description={debouncedSearch ? "Try another name, an alias or fewer words." : "No wanted persons have been imported yet."}
                        action={debouncedSearch && <Button variant="secondary" onClick={() => setSearchTerm("")}>Clear search</Button>}
                    />
                ) : (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
                      {data?.items.map((person) => (
                        <WantedCard
                          key={person.id}
                          person={person}
                          saved={favorites.includes(person.id)}
                          onToggleSave={(e) => toggleFavorite(e, person.id)}
                          onReport={() => reportSighting.open({ id: person.id, title: person.title })}
                        />
                      ))}
                    </div>
                )}

                {/* ZONA DE CONTROL JOS */}
                {data && data.totalCount > 0 && (
                    <Pagination
                        className="mt-12 border-t border-border pt-6"
                        page={pageNumber}
                        pageSize={pageSize}
                        total={data.totalCount}
                        onPageChange={handlePageChange}
                        onPageSizeChange={handlePageSizeChange}
                        pageSizes={[12, 24, 48, 100]}
                        itemLabel="people"
                    />
                )}
            </>
          )}

        {reportSighting.modal}
      </PageContainer>
  );
}
