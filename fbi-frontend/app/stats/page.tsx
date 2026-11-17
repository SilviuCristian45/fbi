"use client";

import AdminGuard from "@/src/components/AdminGuard";
import { useEffect, useState } from "react";
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
import { Activity, BarChart3, MapPin, Users, type LucideIcon } from "lucide-react";
import { useTokenColors } from "@/src/lib/use-token-colors";
import { formatCount } from "@/src/lib/format";
import { PageContainer } from "@/src/components/layout/AppShell";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { Skeleton, LoadingStatus } from "@/src/components/ui/Skeleton";

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
  return (
    <AdminGuard>
      <StatsPageContent />
    </AdminGuard>
  );
}

function StatsPageContent() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        const result: ApiResponse<DashboardStats> = await authFetch<DashboardStats>("/FbiWanted/stats");
        
        if (result?.type === "Error" || !result) {
            throw new Error("SEGMENT_EXPLORER_ERROR: Failed to retrieve intelligence data.");
        }
        setStats(result.data);
      } catch (err) {
        console.error("Eroare la încărcarea statisticilor:", err);
        setError((err instanceof Error && err.message) || "Unknown error while contacting the server.");
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  // --- RENDERING ---
  return (
    <PageContainer>
      <PageHeader
        overline="Admin"
        title="Statistics"
        description="Activity of the sighting reports and the most reported people."
      />
      <StatsBody stats={stats} loading={loading} error={error} />
    </PageContainer>
  );
}

function StatsBody({ stats, loading, error }: { stats: DashboardStats | null; loading: boolean; error: string | null }) {
  const colors = useTokenColors();

  // Cazul 1: Loading
  if (loading) {
    return (
      <div className="grid gap-6">
        <LoadingStatus label="Loading statistics…" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  // Cazul 2: Eroare
  if (error) {
    return (
      <Card>
        <EmptyState
          variant="error"
          title="Statistics could not be loaded"
          description={<>The server did not return the statistics. <span className="block font-mono text-xs">{error}</span></>}
          action={<Button onClick={() => window.location.reload()}>Try again</Button>}
        />
      </Card>
    );
  }

  // Cazul 3: Date lipsă
  if (!stats) {
    return <Card><EmptyState title="No data available" /></Card>;
  }

  // Cazul 4: Success
  const avg = stats.totalSuspects > 0 ? stats.totalSightings / stats.totalSuspects : 0;
  const hasActivity = stats.activityLast7Days.some((d) => d.count > 0);
  const spotted = stats.topSuspects.filter((s) => s.sightingsCount > 0);
  const axis = { stroke: colors?.muted, fontSize: 12, tickLine: false, axisLine: false } as const;
  const tooltip = {
    contentStyle: { background: colors?.surface, color: colors?.fg, border: `1px solid ${colors?.border}`, borderRadius: 8 },
    labelStyle: { color: colors?.fg, fontWeight: 600 },
    itemStyle: { color: colors?.fg },
  };

  return (
    <div className="grid gap-6">
      {/* --- SECȚIUNEA 1: KPI CARDS --- */}
      <dl className="grid gap-4 sm:grid-cols-3">
        <Kpi icon={Users} label="People on the list" value={formatCount(stats.totalSuspects)} />
        <Kpi icon={MapPin} label="Sighting reports" value={formatCount(stats.totalSightings)} />
        <Kpi icon={Activity} label="Reports per person" value={avg.toFixed(2)} hint="Average across the whole list" />
      </dl>

      {/* --- SECȚIUNEA 2: GRAFICE --- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Reports in the last 7 days" />
          <CardBody>
            {!hasActivity ? (
              <EmptyState className="h-[300px] py-0" icon={BarChart3} title="No reports this week" description="New sightings will show up here day by day." />
            ) : (
              <div className="h-[300px] w-full" role="img" aria-label={`Reports per day: ${stats.activityLast7Days.map((d) => `${d.date} ${d.count}`).join(", ")}`}>
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: 300 }}>
                  <AreaChart data={stats.activityLast7Days} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={colors?.primary} stopOpacity={0.35}/>
                        <stop offset="95%" stopColor={colors?.primary} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" {...axis} />
                    <YAxis allowDecimals={false} {...axis} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors?.border} />
                    <Tooltip {...tooltip} cursor={{ stroke: colors?.border }} />
                    <Area type="monotone" dataKey="count" stroke={colors?.primary} strokeWidth={2.5} fillOpacity={1} fill="url(#colorCount)" name="Reports" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Most reported people" />
          <CardBody>
            {spotted.length === 0 ? (
              <EmptyState className="h-[300px] py-0" icon={Users} title="No sightings yet" description="People appear here once they have been reported at least once." />
            ) : (
              <div className="h-[300px] w-full" role="img" aria-label={`Sightings per person: ${spotted.map((s) => `${s.name} ${s.sightingsCount}`).join(", ")}`}>
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: 300 }}>
                  <BarChart layout="vertical" data={spotted} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={colors?.border} />
                    <XAxis type="number" allowDecimals={false} {...axis} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={150}
                      {...axis}
                      tickFormatter={(name: string) => (name.length > 22 ? `${name.slice(0, 21)}…` : name)}
                    />
                    <Tooltip {...tooltip} cursor={{ fill: colors?.subtle }} />
                    <Bar dataKey="sightingsCount" fill={colors?.alert} radius={[0, 4, 4, 0]} barSize={18} name="Sightings" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <Card className="flex items-start justify-between gap-4 p-5">
      <div>
        <dt className="text-[13px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
        <dd className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{value}</dd>
        {hint && <dd className="text-sm text-muted">{hint}</dd>}
      </div>
      <span className="grid size-10 place-items-center rounded-md bg-primary-soft text-primary" aria-hidden="true">
        <Icon className="size-5" />
      </span>
    </Card>
  );
}
