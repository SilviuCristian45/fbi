"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/src/components/AuthGuard";
import { Navbar } from "@/src/components/Navbar";
import { getReports } from "@/src/lib/api-client";
import { ReportPagedResult, ReportItem, ReportStatus } from "@/src/types/reports";
import { ReportDetailsModal } from "@/src/components/ReportDetailsModal"; // <--- Import Nou
import { useSignalR } from "@/src/context/SignalRContext";
import toast from "react-hot-toast";

export default function ReportsPage() {
  const [data, setData] = useState<ReportPagedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const { connection } = useSignalR();
  
  // STATE NOU PENTRU MODAL
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);

  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const totalPages = data ? Math.ceil(data.totalCount / pageSize) : 0;

  const loadData = async () => {
    // ... (codul de incarcare ramane la fel)
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

    console.log("📡 Listening for report updates...");

    // Ascultăm evenimentul trimis din C# (AnalysisFinishedConsumer)
    const handleReportProcessed = (message: any) => {
        console.log("🔔 Report finished:", message);

        console.log('-------------')
        console.log( message.status)
        console.log(message.status === "COMPLETED")
        // Notificare vizuală
        if (message.status === "COMPLETED") {
          console.log("toast displayed")
            toast.success(`Analysis Complete for Report #${message.reportId}`, {
                icon: '🤖'
            });
        }

        // REÎNCĂRCĂM DATELE AUTOMAT
        loadData();
    };

    // Abonare la eveniment
    connection.on("ReportProcessed", handleReportProcessed);

    // Dezabonare la ieșirea din pagină (cleanup)
    return () => {
        connection.off("ReportProcessed", handleReportProcessed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]); // Se activează când conexiunea devine disponibilă
  
  // ... (funcțiile getStatusColor si getStatusBadge raman la fel) ...
  const getStatusColor = (report: ReportItem) => { /* ... */ return ""; }; // Pune codul vechi
  const getStatusBadge = (report: ReportItem) => {
    // 1. Cazul: Încă se procesează (Status = Pending) ⏳
    if (report.status === ReportStatus.Pending) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-blue-50 text-blue-600 rounded-full flex items-center gap-1 border border-blue-100">
           {/* Mic spinner CSS */}
           <svg className="animate-spin h-3 w-3 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
           </svg>
           Analyzing Evidence...
        </span>
      );
    }

    // 2. Cazul: Eșuat ❌
    if (report.status === ReportStatus.Failed) {
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">Analysis Failed</span>;
    }

    // 3. Cazul: Gata (Logica veche) ✅
    if (!report.matches || report.matches.length === 0) {
      return <span className="px-2 py-1 text-xs font-medium bg-green-50 text-green-700 rounded-full border border-green-200">Clean (No Match)</span>;
    }
    
    const maxConfidence = Math.max(...report.matches.map(m => m.confidence));
    
    if (maxConfidence > 80) {
      return <span className="px-2 py-1 text-xs font-bold bg-red-100 text-red-700 rounded-full animate-pulse border border-red-200">⚠️ SUSPECT FOUND ({maxConfidence.toFixed(1)}%)</span>;
    }
    if (maxConfidence > 50) {
      return <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded-full border border-orange-200">Possible Match ({maxConfidence.toFixed(1)}%)</span>;
    }
    return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">Low Probability</span>;
  };

  return (

      <main className="min-h-screen bg-gray-50">
        <Navbar />
        
        {/* AICI RANDAM MODALUL CONDITIONAT */}
        {selectedReport && (
            <ReportDetailsModal 
                report={selectedReport} 
                onClose={() => setSelectedReport(null)} 
            />
        )}

        <div className="max-w-7xl mx-auto p-4 md:p-8">
            {/* ... Titlu si Buton Refresh ... */}
             <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Field Reports Dashboard</h1>
                <button onClick={loadData} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">🔄 Refresh</button>
            </div>

          {loading ? (
             <div className="flex justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
          ) : (
            <div className="space-y-4">
              {data?.items.map((report) => (
                // SCHIMBARE MAJORA: In loc de <Link> folosim <div> cu onClick
                <div 
                  key={report.id} 
                  onClick={() => setSelectedReport(report)} // <--- Deschide Modalul
                  className={`cursor-pointer relative flex flex-col md:flex-row items-start md:items-center gap-4 p-4 rounded-xl border-l-4 transition-all hover:shadow-lg hover:scale-[1.01] duration-200 ${getStatusColor(report)}`}
                >
                    {/* ... Continutul Cardului (Imagine, Text, Badge) RAMANE LA FEL ... */}
                    {/* ... Doar copiaza ce aveai in interiorul Link-ului anterior ... */}
                    
                    <div className="flex-shrink-0 w-full md:w-32 h-32 bg-gray-200 rounded-lg overflow-hidden border border-gray-300">
                        <img src={report.url} className="w-full h-full object-cover" />
                    </div>

                    <div className="flex-grow min-w-0">
                         <div className="flex items-center gap-3 mb-1">
                            {getStatusBadge(report)}
                            <span className="text-xs text-gray-500">ID: #{report.id}</span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 truncate">{report.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">Matches found: {report.matches?.length || 0}</p>
                    </div>

                    {/* Butonul de actiune acum e doar vizual */}
                    <div className="mt-4 md:mt-0 md:ml-4">
                        <button className="px-4 py-2 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
                            View Analysis
                        </button>
                    </div>

                </div>
              ))}
            </div>
          )}
          
         {/* --- PAGINARE AVANSATĂ --- */}
          {data && data.totalCount > 0 && (
            <div className="sticky bottom-0 mt-6 bg-white border-t border-gray-200 p-4 rounded-xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 z-10">
              
              {/* STÂNGA: Selector Rows Per Page */}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPageNumber(1); // Resetăm la pagina 1 când schimbăm mărimea
                  }}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-1.5 outline-none cursor-pointer"
                >
                  <option value={10}>10 rows</option>
                  <option value={20}>20 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={100}>100 rows</option>
                </select>
                <span className="hidden sm:inline text-gray-400">|</span>
                <span className="hidden sm:inline">
                  Total: <span className="font-bold text-gray-800">{data.totalCount}</span> reports
                </span>
              </div>

              {/* DREAPTA: Butoane Numerotate */}
              <div className="flex items-center gap-1">
                {/* Buton Previous */}
                <button
                  onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                  disabled={pageNumber === 1}
                  className="px-3 py-1 text-sm border rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  &laquo; Prev
                </button>

                {/* Generare dinamică a numerelor de pagină */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  // Algoritm simplu de "sliding window" pentru pagini
                  let pageNum = pageNumber;
                  if (totalPages <= 5) {
                     pageNum = i + 1; // Dacă sunt puține pagini, le arătăm pe toate (1,2,3,4,5)
                  } else if (pageNumber <= 3) {
                     pageNum = i + 1; // Dacă suntem la început (1,2,3,4,5)
                  } else if (pageNumber >= totalPages - 2) {
                     pageNum = totalPages - 4 + i; // Dacă suntem la final
                  } else {
                     pageNum = pageNumber - 2 + i; // Dacă suntem la mijloc (ex: 4,5,6,7,8)
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPageNumber(pageNum)}
                      className={`w-8 h-8 flex items-center justify-center text-sm rounded-md transition-all ${
                        pageNumber === pageNum
                          ? "bg-blue-600 text-white font-bold shadow-md"
                          : "text-gray-600 hover:bg-gray-100 border border-transparent hover:border-gray-200"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                {/* Buton Next */}
                <button
                  onClick={() => setPageNumber(p => Math.min(totalPages, p + 1))}
                  disabled={pageNumber === totalPages}
                  className="px-3 py-1 text-sm border rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
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