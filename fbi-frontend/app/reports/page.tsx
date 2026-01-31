"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/src/components/Navbar";
import { getReports } from "@/src/lib/api-client";
import { ReportPagedResult, ReportItem, ReportStatus } from "@/src/types/reports";
import { ReportDetailsModal } from "@/src/components/ReportDetailsModal";
import { useSignalR } from "@/src/context/SignalRContext";
import toast from "react-hot-toast";

export default function ReportsPage() {
  const [data, setData] = useState<ReportPagedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const { connection } = useSignalR();
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const totalPages = data ? Math.ceil(data.totalCount / pageSize) : 0;

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getReports(pageNumber, pageSize);
      setData(result.data);
    } catch (error) {
      console.error(error);
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
    const handleReportProcessed = (message: any) => {
        if (message.status === "COMPLETED") {
            toast.success(`Analysis Complete for Report #${message.reportId}`, { icon: '🤖' });
        }
        loadData();
    };
    connection.on("ReportProcessed", handleReportProcessed);
    return () => {
        connection.off("ReportProcessed", handleReportProcessed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);
  
  const getStatusColor = (report: ReportItem) => { 
      // Păstrăm border-ul colorat din stânga, e util vizual
      if (report.status === ReportStatus.Pending) return "border-blue-500";
      if (report.status === ReportStatus.Failed) return "border-gray-400";
      if (!report.matches || report.matches.length === 0) return "border-green-500";
      const maxConf = Math.max(...report.matches.map(m => m.confidence));
      if (maxConf > 80) return "border-red-600";
      if (maxConf > 50) return "border-orange-500";
      return "border-blue-400";
  };

  const getStatusBadge = (report: ReportItem) => {
    // 1. Pending ⏳ (Dark: albastru închis transparent)
    if (report.status === ReportStatus.Pending) {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1 border 
                         bg-blue-50 text-blue-600 border-blue-100 
                         dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
           <svg className="animate-spin h-3 w-3 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
           </svg>
           Analyzing...
        </span>
      );
    }

    // 2. Failed ❌ (Dark: gri)
    if (report.status === ReportStatus.Failed) {
        return <span className="px-2 py-1 text-xs font-medium rounded-full 
                                bg-gray-100 text-gray-500 
                                dark:bg-gray-700 dark:text-gray-300">Analysis Failed</span>;
    }

    // 3. Clean ✅ (Dark: verde închis)
    if (!report.matches || report.matches.length === 0) {
      return <span className="px-2 py-1 text-xs font-medium rounded-full border 
                              bg-green-50 text-green-700 border-green-200
                              dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">Clean (No Match)</span>;
    }
    
    // 4. Matches ⚠️ (Dark: roșu/portocaliu)
    const maxConfidence = Math.max(...report.matches.map(m => m.confidence));
    
    if (maxConfidence > 80) {
      return <span className="px-2 py-1 text-xs font-bold rounded-full animate-pulse border 
                              bg-red-100 text-red-700 border-red-200
                              dark:bg-red-900/40 dark:text-red-300 dark:border-red-800">⚠️ SUSPECT FOUND ({maxConfidence.toFixed(1)}%)</span>;
    }
    if (maxConfidence > 50) {
      return <span className="px-2 py-1 text-xs font-medium rounded-full border 
                              bg-orange-100 text-orange-700 border-orange-200
                              dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800">Possible Match ({maxConfidence.toFixed(1)}%)</span>;
    }
    return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full dark:bg-blue-900 dark:text-blue-300">Low Probability</span>;
  };

  return (
      // 1. Fundal principal (Dark: gray-900)
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <Navbar />
        
        {selectedReport && (
            <ReportDetailsModal 
                report={selectedReport} 
                onClose={() => setSelectedReport(null)} 
            />
        )}

        <div className="max-w-7xl mx-auto p-4 md:p-8">
             {/* Header */}
             <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Field Reports Dashboard</h1>
                <button onClick={loadData} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition dark:bg-blue-500 dark:hover:bg-blue-600 shadow-md">
                    🔄 Refresh
                </button>
            </div>

          {loading ? (
             <div className="flex justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div></div>
          ) : (
            <div className="space-y-4">
              {data?.items.map((report) => (
                <div 
                  key={report.id} 
                  onClick={() => setSelectedReport(report)}
                  // 2. Cardul Raportului: 
                  // Light: bg-white
                  // Dark: bg-gray-800, border-gray-700
                  className={`cursor-pointer relative flex flex-col md:flex-row items-start md:items-center gap-4 p-4 rounded-xl border-l-4 transition-all hover:shadow-lg hover:scale-[1.01] duration-200 
                              bg-white border-y border-r border-gray-100 
                              dark:bg-gray-800 dark:border-gray-700 dark:border-l-0 shadow-sm
                              ${getStatusColor(report)}`}
                >
                    {/* Imagine */}
                    <div className="flex-shrink-0 w-full md:w-32 h-32 bg-gray-200 rounded-lg overflow-hidden border border-gray-300 dark:bg-gray-700 dark:border-gray-600">
                        <img src={report.url} className="w-full h-full object-cover" alt="Evidence" />
                    </div>

                    <div className="flex-grow min-w-0">
                         <div className="flex items-center gap-3 mb-1">
                            {getStatusBadge(report)}
                            <span className="text-xs text-gray-500 dark:text-gray-400">ID: #{report.id}</span>
                        </div>
                        {/* Titlu Raport */}
                        <h3 className="text-lg font-bold text-gray-900 truncate dark:text-white">{report.name}</h3>
                        <p className="text-sm text-gray-600 mt-1 dark:text-gray-300">Matches found: {report.matches?.length || 0}</p>
                    </div>

                    {/* Buton View Analysis (Secondary Button) */}
                    <div className="mt-4 md:mt-0 md:ml-4">
                        <button className="px-4 py-2 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 
                                           dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors">
                            View Analysis
                        </button>
                    </div>

                </div>
              ))}
            </div>
          )}
          
          {/* --- PAGINARE --- */}
          {data && data.totalCount > 0 && (
            // 3. Bara Sticky de jos
            <div className="sticky bottom-0 mt-6 border-t p-4 rounded-xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 z-10 
                            bg-white border-gray-200 
                            dark:bg-gray-800 dark:border-gray-700">
              
              {/* Selector Rows */}
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <span>Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPageNumber(1);
                  }}
                  className="border text-sm rounded-lg block p-1.5 outline-none cursor-pointer 
                             bg-gray-50 border-gray-300 text-gray-900 focus:ring-blue-500 focus:border-blue-500
                             dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                >
                  <option value={10}>10 rows</option>
                  <option value={20}>20 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={100}>100 rows</option>
                </select>
                <span className="hidden sm:inline text-gray-400">|</span>
                <span className="hidden sm:inline">
                  Total: <span className="font-bold text-gray-800 dark:text-white">{data.totalCount}</span> reports
                </span>
              </div>

              {/* Butoane Paginare */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                  disabled={pageNumber === 1}
                  className="px-3 py-1 text-sm border rounded-md transition 
                             hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed
                             dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  &laquo; Prev
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = pageNumber;
                  if (totalPages <= 5) {
                      pageNum = i + 1;
                  } else if (pageNumber <= 3) {
                      pageNum = i + 1;
                  } else if (pageNumber >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                  } else {
                      pageNum = pageNumber - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPageNumber(pageNum)}
                      className={`w-8 h-8 flex items-center justify-center text-sm rounded-md transition-all ${
                        pageNumber === pageNum
                          ? "bg-blue-600 text-white font-bold shadow-md dark:bg-blue-500"
                          : "text-gray-600 hover:bg-gray-100 border border-transparent hover:border-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:border-gray-600"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => setPageNumber(p => Math.min(totalPages, p + 1))}
                  disabled={pageNumber === totalPages}
                  className="px-3 py-1 text-sm border rounded-md transition 
                             hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed
                             dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Next &raquo;
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
  );
}