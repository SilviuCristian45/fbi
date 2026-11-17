"use client";

import AdminGuard from "@/src/components/AdminGuard";
import { useEffect, useState } from "react";
import { getReports } from "@/src/lib/api-client";
import { ReportPagedResult, ReportItem } from "@/src/types/reports";
import { ReportDetailsModal } from "@/src/components/ReportDetailsModal";
import { useSignalR } from "@/src/context/SignalRContext";
import toast from "react-hot-toast";
import { FileSearch, RefreshCw } from "lucide-react";
import { PageContainer } from "@/src/components/layout/AppShell";
import { ConnectionStatus } from "@/src/components/layout/ConnectionStatus";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { Skeleton, LoadingStatus } from "@/src/components/ui/Skeleton";
import { Pagination } from "@/src/components/ui/Pagination";
import { Table, THead, TBody, TR, TH, TD } from "@/src/components/ui/Table";
import { ReportStatusBadge, ConfidenceBar, reportStatus } from "@/src/components/reports/ReportStatus";
import { PersonPhoto } from "@/src/components/wanted/PersonPhoto";

export default function ReportsPage() {
  return (
    <AdminGuard>
      <ReportsPageContent />
    </AdminGuard>
  );
}

function ReportsPageContent() {
  const [data, setData] = useState<ReportPagedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { connection } = useSignalR();
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const totalPages = data ? Math.ceil(data.totalCount / pageSize) : 0;

  const loadData = async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getReports(pageNumber, pageSize);
      setData(result.data);
    } catch (error) {
      console.error(error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, pageSize]);

  useEffect(() => {
    if (!connection) return;
    const handleReportProcessed = (message: { status?: string; reportId?: number }) => {
        if (message.status === "COMPLETED") {
            toast.success(`Analysis complete for report #${message.reportId}`);
        }
        loadData();
    };
    connection.on("ReportProcessed", handleReportProcessed);
    return () => {
        connection.off("ReportProcessed", handleReportProcessed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);
  
  const handlePageChange = (page: number) => { if (page >= 1 && page <= totalPages) setPageNumber(page); };

  return (
      <PageContainer>
        {selectedReport && (
            <ReportDetailsModal
                report={selectedReport}
                onClose={() => setSelectedReport(null)}
            />
        )}

        <PageHeader
            overline="Admin"
            title="Field reports"
            description="Sightings sent by users and the result of the face analysis. The list refreshes when an analysis finishes."
            actions={
                <>
                    <ConnectionStatus />
                    <Button variant="secondary" onClick={loadData} loading={loading}>
                        {!loading && <RefreshCw className="size-4" aria-hidden="true" />} Refresh
                    </Button>
                </>
            }
        />

        <Card className="overflow-hidden">
          {loading && !data ? (
             <div className="grid gap-3 p-5">
                <LoadingStatus label="Loading reports…" />
                {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
             </div>
          ) : error ? (
             <EmptyState
                variant="error"
                title="Reports could not be loaded"
                description="Check your connection and try again."
                action={<Button onClick={loadData}>Try again</Button>}
             />
          ) : !data || data.items.length === 0 ? (
             <EmptyState
                icon={FileSearch}
                title="No reports yet"
                description="Sightings reported by users appear here, with the result of the face analysis."
             />
          ) : (
            <>
              {/* Desktop: dense table */}
              <div className="hidden md:block">
                <Table caption="Field reports">
                  <THead>
                    <TR>
                      <TH>Report</TH>
                      <TH>Person</TH>
                      <TH>Status</TH>
                      <TH>Best match</TH>
                      <TH className="text-right">Matches</TH>
                      <TH>Location</TH>
                      <TH><span className="sr-only">Actions</span></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.items.map((report) => {
                      const { best } = reportStatus(report);
                      return (
                        <TR key={report.id} className="hover:bg-subtle">
                          <TD className="font-mono text-xs text-muted">#{report.id}</TD>
                          <TD>
                            <span className="flex items-center gap-3">
                              <PersonPhoto src={report.url} alt="" position="center" className="size-10 shrink-0 rounded-md" />
                              <span className="max-w-64 truncate font-semibold" title={report.name}>{report.name}</span>
                            </span>
                          </TD>
                          <TD><ReportStatusBadge report={report} /></TD>
                          <TD>{best !== null ? <ConfidenceBar value={best} /> : <span className="text-muted">—</span>}</TD>
                          <TD className="text-right font-mono text-xs">{report.matches?.length || 0}</TD>
                          <TD className="whitespace-nowrap font-mono text-xs text-muted">{report.latitude?.toFixed(4)}, {report.longitude?.toFixed(4)}</TD>
                          <TD className="text-right">
                            <Button variant="secondary" size="sm" onClick={() => setSelectedReport(report)} aria-label={`View analysis for report ${report.id}`}>
                              View analysis
                            </Button>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </div>

              {/* Mobile: one row per report */}
              <ul className="divide-y divide-border md:hidden">
                {data.items.map((report) => {
                  const { best } = reportStatus(report);
                  return (
                    <li key={report.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedReport(report)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-subtle"
                      >
                        <PersonPhoto src={report.url} alt="" position="center" className="size-14 shrink-0 rounded-md" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{report.name}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            <ReportStatusBadge report={report} />
                            {best !== null && <ConfidenceBar value={best} />}
                          </span>
                          <span className="mt-1 block font-mono text-xs text-muted">#{report.id}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>

        {/* --- PAGINARE --- */}
        {data && data.totalCount > 0 && (
          <Pagination
            className="mt-6"
            page={pageNumber}
            pageSize={pageSize}
            total={data.totalCount}
            onPageChange={handlePageChange}
            onPageSizeChange={(size) => { setPageSize(size); setPageNumber(1); }}
            pageSizes={[10, 20, 50, 100]}
            itemLabel="reports"
          />
        )}
      </PageContainer>
  );
}
