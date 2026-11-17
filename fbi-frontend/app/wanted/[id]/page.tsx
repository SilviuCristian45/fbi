"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { AlertTriangle, ArrowLeft, FileDown, MapPinPlus, UserX } from "lucide-react";
import { authFetchFile, getWantedPersonById } from "@/src/lib/api-client";
import { WantedPersonDetail } from "@/src/types/wanted-person";
import SightingsList from "@/src/components/SightingsList";
import { useReportSighting } from "@/src/lib/use-report-sighting";
import { PageContainer } from "@/src/components/layout/AppShell";
import { Button, buttonClasses } from "@/src/components/ui/Button";
import { Card, CardHeader, CardBody } from "@/src/components/ui/Card";
import { Chip } from "@/src/components/ui/Badge";
import { Skeleton, LoadingStatus } from "@/src/components/ui/Skeleton";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { PersonPhoto } from "@/src/components/wanted/PersonPhoto";
import { cn } from "@/src/lib/cn";

export default function WantedDetailPage() {
  const { id } = useParams();

  const [person, setPerson] = useState<WantedPersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string>("");
  const [downloading, setDownloading] = useState(false);
  const reportSighting = useReportSighting();

  const exportPdf = async () => {
    if (!person || !id) return;

    setDownloading(true);
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
        toast.error("The dossier could not be generated. Please try again.");
        console.error(error);
    } finally {
        setDownloading(false);
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

  const backLink = (
    <Link href="/" className="inline-flex items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" /> All wanted people
    </Link>
  );

  if (loading) {
    return (
      <PageContainer>
        <LoadingStatus label="Loading the person's file…" />
        <Skeleton className="h-5 w-40" />
        <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-12">
          <Skeleton className="aspect-[4/5] w-full rounded-lg" />
          <div className="grid content-start gap-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-72" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!person) {
    return (
      <PageContainer>
        {backLink}
        <EmptyState
          icon={UserX}
          title="Person not found"
          description="This file does not exist or could not be loaded."
          action={<Link href="/" className={buttonClasses("primary")}>Back to the wanted list</Link>}
        />
      </PageContainer>
    );
  }

  const facts = [
    ["Sex", person.sex],
    ["Race", person.race],
    ["Hair", person.hair],
    ["Eyes", person.eyes],
  ].filter((f): f is [string, string] => Boolean(f[1]));

  return (
      <PageContainer>
          {backLink}

          {/* POZE ȘI DATE PRINCIPALE */}
          <section className="mt-6 grid gap-8 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-12" aria-labelledby="person-name">
            <div>
              <div className="overflow-hidden rounded-lg bg-subtle">
                <PersonPhoto src={selectedImage} alt={`Photo of ${person.title}`} className="aspect-[4/5] w-full" />
              </div>

              {/* Thumbnails */}
              {person.images.length > 1 && (
                <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Photos">
                  {person.images.map((img, idx) => (
                    <li key={idx} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedImage(img)}
                        aria-label={`Show photo ${idx + 1} of ${person.images.length}`}
                        aria-current={selectedImage === img ? "true" : undefined}
                        className={cn(
                          "block size-16 overflow-hidden rounded-md border-2 transition-opacity",
                          selectedImage === img ? "border-strong" : "border-transparent opacity-70 hover:opacity-100",
                        )}
                      >
                        <PersonPhoto src={img} alt="" className="size-full" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="min-w-0">
              {person.subjects && person.subjects.length > 0 && (
                <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">{person.subjects.join(" · ")}</p>
              )}
              <h1 id="person-name" className="mt-2 text-4xl font-extrabold leading-[1.05] tracking-tight text-balance break-words sm:text-5xl">
                {person.title}
              </h1>

              {person.rewardText && (
                <div className="mt-6 rounded-lg border border-border bg-subtle p-5">
                  <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">Reward</p>
                  <p className="mt-1 text-lg font-semibold leading-snug">{person.rewardText}</p>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <Button size="lg" onClick={() => reportSighting.open({ id: person.id, title: person.title })} className="max-sm:w-full">
                  <MapPinPlus className="size-5" aria-hidden="true" /> Report a sighting
                </Button>
                <Button variant="secondary" size="lg" onClick={exportPdf} loading={downloading} className="max-sm:w-full">
                  {!downloading && <FileDown className="size-5" aria-hidden="true" />} Download dossier (PDF)
                </Button>
              </div>

              {facts.length > 0 && (
                <dl className="mt-8 grid grid-cols-2 border-t-2 border-strong sm:grid-cols-4">
                  {facts.map(([label, value]) => (
                    <div key={label} className="border-b border-border py-3 pr-4">
                      <dt className="text-sm text-muted">{label}</dt>
                      <dd className="mt-0.5 font-semibold capitalize">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {/* Alias-uri */}
              {person.aliases && person.aliases.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-sm font-semibold text-muted">Known aliases</h2>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {person.aliases.map((alias, i) => (
                      <li key={i}><Chip>{alias}</Chip></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* DESCRIERE ȘI LIVE FEED */}
          <div className="mt-12 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="grid gap-6">
              {/* Caution / Remarks */}
              {(person.caution || person.details) && (
                <section className="rounded-r-lg border-l-4 border-alert bg-alert-soft p-5" aria-labelledby="caution-title">
                  <h2 id="caution-title" className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="size-5 text-alert" aria-hidden="true" /> Caution
                  </h2>
                  <div
                    className="mt-2 leading-relaxed [&_a]:font-semibold [&_a]:underline [&_p:not(:last-child)]:mb-3"
                    dangerouslySetInnerHTML={{ __html: person.caution || person.details || "" }}
                  />
                </section>
              )}

              {/* Descriere Textuală */}
              {person.description && (
                <Card>
                  <CardHeader title="Case details" />
                  <CardBody>
                    <p className="whitespace-pre-line leading-relaxed">{person.description}</p>
                  </CardBody>
                </Card>
              )}
            </div>

            {/* LIVE FEED */}
            <div className="lg:sticky lg:top-24">
              <SightingsList wantedId={person.id} />
            </div>
          </div>

        {reportSighting.modal}
      </PageContainer>
  );
}
