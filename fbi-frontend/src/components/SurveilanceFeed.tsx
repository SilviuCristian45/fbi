"use client";

import { useEffect, useState } from "react";
import { useSignalR } from "../context/SignalRContext";

export default function SurveillanceFeed() {
  const [messages, setMessages] = useState<string[]>([]);
  const { connection } = useSignalR();

  // Helper pentru adăugarea mesajelor (păstrăm doar ultimele 5)
  const addLog = (text: string) => {
    const time = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: "2-digit", 
        minute: "2-digit", 
        second: "2-digit" 
    });
    setMessages(prev => [`[${time}] ${text}`, ...prev].slice(0, 5));
  };

  useEffect(() => {
    if (!connection) return;

    // 1. Ascultăm noi locații (din SightingsList)
    const handleLocation = (data: any) => {
        addLog(`SIGNAL TRACED: Agent ${data.reportedBy} sent coords.`);
    };

    // 2. Ascultăm procesarea rapoartelor (din ReportsPage)
    const handleReport = (data: any) => {
        if (data.status === "COMPLETED") {
            addLog(`AI ANALYSIS: Report #${data.reportId} finished.`);
        } else if (data.status === "FAILED") {
            addLog(`ERR_module_ai: Report #${data.reportId} failed.`);
        }
    };

    connection.on("ReceiveLocation", handleLocation);
    connection.on("ReportProcessed", handleReport);

    return () => {
        connection.off("ReceiveLocation", handleLocation);
        connection.off("ReportProcessed", handleReport);
    };
  }, [connection]);

  // Dacă nu sunt mesaje, nu afișăm nimic
  if (messages.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 w-80 z-50 transition-all duration-300 animate-in slide-in-from-bottom-5 fade-in
                    bg-white border border-gray-200 shadow-xl
                    dark:bg-slate-900 dark:border-green-900/50 dark:shadow-green-900/20 rounded-lg p-4 font-mono text-sm">
      
      <h4 className="border-b pb-2 mb-2 font-bold uppercase flex items-center gap-2
                     border-gray-100 text-gray-700
                     dark:border-green-900/50 dark:text-green-400">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
        System Log
      </h4>
      
      <ul className="space-y-1.5">
        {messages.map((msg, idx) => (
          <li key={idx} className="opacity-90 hover:opacity-100 transition-opacity truncate
                                   text-gray-600 dark:text-green-300/90">
            <span className="text-gray-400 dark:text-green-700 font-bold mr-1">{">"}</span> 
            {msg}
          </li>
        ))}
      </ul>
    </div>
  );
}