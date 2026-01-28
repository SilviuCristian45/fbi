"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/src/components/AuthGuard";
import { Navbar } from "@/src/components/Navbar";
import { authFetch } from "@/src/lib/api-client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { ApiResponse } from "@/src/types/api";

// --- TIPURI DE DATE ---
interface ChartDataPoint {
  date: string;
  count: number;
}

interface TopSuspectDto {
  name: string;
  sightingsCount: number;
}

interface DashboardStats {
  totalSuspects: number;
  totalSightings: number;
  activityLast7Days: ChartDataPoint[];
  topSuspects: TopSuspectDto[];
}

export default function StatsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  // 1. Adăugăm stare pentru eroare
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        const result: ApiResponse<DashboardStats> = await authFetch<DashboardStats>("/FbiWanted/stats");
        console.log(result.data)
        // 2. Simulăm sau verificăm eroarea așa cum ai vrut
        if (result?.type === "Error" || !result) {
            throw new Error("SEGMENT_EXPLORER_ERROR: Failed to retrieve intelligence data.");
        }
        setStats(result.data);
      } catch (err: any) {
        console.error("Eroare la încărcarea statisticilor:", err);
        // 3. Setăm mesajul de eroare pentru a fi afișat
        setError(err.message || "Eroare necunoscută la conectarea cu serverul.");
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  // --- RENDERING ---

  // Cazul 1: Loading
  if (loading) {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600"></div>
            <p className="mt-4 text-gray-500 font-mono animate-pulse">Analyzing Intelligence Data...</p>
        </div>
    );
  }

  // Cazul 2: Eroare (Aici afișăm mesajul tău simulat)
  if (error) {
    return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-red-100">
                    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
                        <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">System Alert</h3>
                    <p className="text-red-500 font-mono text-sm bg-red-50 p-3 rounded border border-red-200 break-words">
                        {error}
                    </p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="mt-6 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
                    >
                        Retry Connection ↻
                    </button>
                </div>
            </div>
    );
  }

  // Cazul 3: Date lipsă (Fallback)
  if (!stats) {
    return <div className="p-10 text-center text-gray-500">No data available.</div>;
  }

  // Cazul 4: Success (Dashboard-ul normal)
  return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8 pt-6">
          <Navbar />

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">📊 Intelligence Dashboard</h1>
            <p className="text-gray-500">Analiză în timp real a activității operative.</p>
          </div>

          {/* --- SECȚIUNEA 1: KPI CARDS --- */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Card 1: Total Suspecți */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Targets</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.totalSuspects}</p>
                </div>
                <div className="p-3 bg-red-100 rounded-full text-red-600">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Card 2: Total Raportări */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Intel Reports</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.totalSightings}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full text-blue-600">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Card 3: Eficiență */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Avg. Sightings / Target</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {stats.totalSuspects > 0 
                        ? (stats.totalSightings / stats.totalSuspects).toFixed(2) 
                        : "0"} %
                  </p>
                </div>
                <div className="p-3 bg-green-100 rounded-full text-green-600">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* --- SECȚIUNEA 2: GRAFICE --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Grafic 1: Activitate 7 Zile */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-4">📈 Activity (Last 7 Days)</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.activityLast7Days} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#1F2937', color: '#fff', borderRadius: '8px', border: 'none' }}
                        itemStyle={{ color: '#60A5FA' }}
                    />
                    <Area 
                        type="monotone" 
                        dataKey="count" 
                        stroke="#3B82F6" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorCount)" 
                        name="Rapoarte"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Grafic 2: Top Suspecți */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-4">🔥 Most Spotted Targets</h3>
              {stats.topSuspects.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-gray-400">
                      Nu există suficiente date.
                  </div>
              ) : (
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={stats.topSuspects} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                        <XAxis type="number" hide />
                        <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={100} 
                            stroke="#4B5563" 
                            fontSize={11} 
                            tickLine={false} 
                            axisLine={false}
                        />
                        <Tooltip 
                            cursor={{fill: '#F3F4F6'}}
                            contentStyle={{ backgroundColor: '#1F2937', color: '#fff', borderRadius: '8px', border: 'none' }}
                        />
                        <Bar dataKey="sightingsCount" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={20} name="Observații" />
                    </BarChart>
                    </ResponsiveContainer>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
  );
}