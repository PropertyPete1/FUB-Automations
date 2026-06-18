import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  Mail,
  UserMinus,
  AlertTriangle,
  CheckCircle,
  ShieldAlert,
  Clock,
  RefreshCw,
  MapPin,
  FileText,
  Search,
  Check,
  AlertCircle,
  TrendingUp,
  Send,
  Loader2,
  Users,
  ExternalLink,
  Flame,
  AlertOctagon,
  Activity,
  ArrowLeft,
  Zap,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import LifestyleBotPanel from "@/components/LifestyleBotPanel";

const COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6"];

const AGENT_GRADIENTS: Record<string, string> = {
  peter:    "from-amber-500 to-amber-700",
  steven:   "from-blue-500 to-blue-700",
  tiffany:  "from-violet-500 to-violet-700",
  stefanie: "from-rose-500 to-rose-700",
  abby:     "from-emerald-500 to-emerald-700",
  irma:     "from-orange-500 to-orange-700",
  laila:    "from-cyan-500 to-cyan-700",
};

export default function Home() {
  const [activeTab, setActiveTab] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // ── Live data ─────────────────────────────────────────────────────────────
  const { data, isLoading, error, refetch, isRefetching } = trpc.fub.getDashboardStats.useQuery(
    undefined,
    { staleTime: 25_000, refetchInterval: 30_000, refetchIntervalInBackground: false }
  );

  const { data: pendingQueue } = trpc.fub.getPendingQueue.useQuery(
    {},
    { staleTime: 2 * 60_000 }
  );

  const { data: rosterData, isLoading: rosterLoading, refetch: refetchRoster } =
    trpc.agent.getRoster.useQuery(undefined, { staleTime: 10 * 60_000 });

  const { data: botStatus } = trpc.bot.getStatus.useQuery(
    undefined,
    { staleTime: 2 * 60_000, refetchInterval: 2 * 60_000 }
  );

  const utils = trpc.useUtils();

  const refreshRosterMutation = trpc.agent.refreshRoster.useMutation({
    onSuccess: (d) => {
      utils.agent.getRoster.setData(undefined, d);
      toast.success("Roster refreshed", { description: "All agent counts updated live from FUB." });
    },
    onError: () => toast.error("Refresh failed", { description: "Could not reach FUB. Try again." }),
  });

  const { data: auditData, isLoading: auditLoading, refetch: refetchAudit } =
    trpc.audit.getStatus.useQuery(undefined, { staleTime: 60_000 });

  const runAuditMutation = trpc.audit.run.useMutation({
    onSuccess: () => { void utils.audit.getStatus.invalidate(); },
    onError: (err) => {
      const msg = err.message?.toLowerCase() ?? "";
      if (msg.includes("login") || msg.includes("unauth") || msg.includes("10001")) {
        alert("You need to be logged in to run the audit.");
      } else {
        alert(`Audit failed: ${err.message}`);
      }
    },
  });

  const auditRunning = runAuditMutation.isPending;
  const fetchAuditStatus = useCallback(() => { void refetchAudit(); }, [refetchAudit]);
  const handleRunAudit = useCallback(() => { runAuditMutation.mutate(); }, [runAuditMutation]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!data) return { sentEmails: 0, suppressedEmails: 0, completedReassignments: 0, capReachedCount: 0, keywordReassignments: 0, lastUpdated: null as string | null };
    if (data.live_stats) {
      return {
        sentEmails: data.live_stats.pond_nurture_sent,
        suppressedEmails: data.live_stats.total_suppressed,
        completedReassignments: data.live_stats.stale_reassignment_completed,
        capReachedCount: data.live_stats.launch_cap_reached,
        keywordReassignments: data.live_stats.keyword_reassignment_completed,
        lastUpdated: data.live_stats.last_updated,
      };
    }
    let sentEmails = 0, suppressedEmails = 0, completedReassignments = 0, capReachedCount = 0, keywordReassignments = 0;
    data.counts.forEach(item => {
      if (item.action === "pond_nurture") {
        if (item.status === "sent") sentEmails += item.cnt;
        if (item.status === "suppressed") suppressedEmails += item.cnt;
      } else if (item.action === "stale_agent_pond_reassignment") {
        if (item.status === "completed") completedReassignments += item.cnt;
        if (item.status === "suppressed") suppressedEmails += item.cnt;
        if (item.status === "launch_cap_reached") capReachedCount += item.cnt;
      } else if (item.action === "pond_keyword_reassignment") {
        if (item.status === "completed") keywordReassignments += item.cnt;
      }
    });
    return { sentEmails, suppressedEmails, completedReassignments, capReachedCount, keywordReassignments, lastUpdated: null as string | null };
  }, [data]);

  const timelineData = useMemo(() => {
    if (!data) return [];
    const map: Record<string, { date: string; sent: number; reassignments: number; suppressed: number }> = {};
    data.timeline.forEach(item => {
      if (!map[item.date]) map[item.date] = { date: item.date, sent: 0, reassignments: 0, suppressed: 0 };
      if (item.action === "pond_nurture" && item.status === "sent") map[item.date].sent += item.cnt;
      else if (item.action === "pond_nurture" && item.status === "suppressed") map[item.date].suppressed += item.cnt;
      else if (item.action === "stale_agent_pond_reassignment" && item.status === "completed") map[item.date].reassignments += item.cnt;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const suppressionData = useMemo(() => {
    if (!data) return [];
    return data.suppressions
      .map(item => {
        const parts = item.reason.split("::");
        return { name: parts.length > 1 ? parts[1] : parts[0], value: item.count };
      })
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const cityData = useMemo(() => {
    if (!data) return [];
    return [...data.cities].sort((a, b) => b.count - a.count);
  }, [data]);

  const filteredActivity = useMemo(() => {
    if (!data) return [];
    return data.recent_activity.filter(item => {
      const matchesSearch =
        item.person_id?.toString().includes(searchTerm) ||
        JSON.stringify(item.details).toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.status.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch &&
        (filterAction === "all" || item.action === filterAction) &&
        (filterStatus === "all" || item.status === filterStatus);
    });
  }, [data, searchTerm, filterAction, filterStatus]);

  // ── Loading / error ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] text-[#0F1117] font-sans antialiased">
        {/* Skeleton header */}
        <header className="sticky top-0 z-40 w-full bg-white border-b border-[#E4E7EF]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-sm text-[#0F1117] tracking-tight">FUB Nurture</span>
            </div>
            <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* KPI strip skeleton */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white border border-[#E4E7EF] rounded-xl p-4 space-y-2">
                <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                <div className="h-7 w-14 bg-slate-100 rounded animate-pulse" />
                <div className="h-2.5 w-24 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </section>
          {/* Status + audit row skeleton */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 bg-white border border-[#E4E7EF] rounded-xl p-4 space-y-3">
              <div className="h-3 w-28 bg-slate-100 rounded animate-pulse" />
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-4 w-4 rounded-full bg-slate-100 animate-pulse" />
                  <div className="h-3 flex-1 bg-slate-100 rounded animate-pulse" />
                  <div className="h-5 w-16 bg-slate-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
            <div className="bg-white border border-[#E4E7EF] rounded-xl p-4 space-y-3">
              <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
              <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" />
              <div className="h-2 w-full bg-slate-100 rounded animate-pulse" />
              <div className="h-2.5 w-20 bg-slate-100 rounded animate-pulse" />
            </div>
          </section>
          {/* Agent grid skeleton */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-[#E4E7EF] rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-24 bg-slate-100 rounded animate-pulse" />
                    <div className="h-2.5 w-16 bg-slate-100 rounded animate-pulse" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="bg-slate-50 rounded-lg p-2 space-y-1">
                      <div className="h-5 w-8 bg-slate-100 rounded animate-pulse" />
                      <div className="h-2 w-12 bg-slate-100 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
                <div className="h-8 w-full bg-slate-100 rounded-lg animate-pulse" />
              </div>
            ))}
          </section>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400 max-w-sm text-center">
          <AlertCircle className="h-7 w-7 text-red-400" />
          <p className="text-sm font-medium text-slate-700">Failed to load dashboard</p>
          <p className="text-xs text-slate-400">{error?.message ?? "Unknown error"}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F8F9FC] text-[#0F1117] font-sans antialiased">

      {/* ── Top Navigation Bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full bg-white border-b border-[#E4E7EF]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-sm text-[#0F1117] tracking-tight">FUB Nurture</span>
            <span className="hidden sm:block text-xs text-slate-400">/ Lifestyle Design Realty</span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {stats.lastUpdated && (
              <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                Live · {new Date(stats.lastUpdated).toLocaleTimeString()}
              </div>
            )}

            <a
              href="https://lifestyledash-wpnl8v84.manus.space"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-[#E4E7EF] transition-all duration-150"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Bot Dashboard
            </a>

            <Link href="/sms-queue">
              <Button size="sm" className="h-8 gap-1.5 text-xs bg-amber-500 hover:bg-amber-400 text-white font-semibold shadow-none">
                <Send className="h-3.5 w-3.5" />
                Power Queue
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs text-slate-500 border-[#E4E7EF] bg-white shadow-none"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{isRefetching ? "Refreshing…" : "Refresh"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Emails Sent", value: stats.sentEmails.toLocaleString(), sub: "Pond nurture total", icon: <Mail className="h-4 w-4 text-blue-500" />, accent: "text-blue-600" },
            { label: "Reassignments", value: stats.completedReassignments.toLocaleString(), sub: "Stale leads → pond", icon: <UserMinus className="h-4 w-4 text-emerald-500" />, accent: "text-emerald-600" },
            { label: "Suppressed", value: stats.suppressedEmails.toLocaleString(), sub: "Safety filters applied", icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, accent: "text-amber-600" },
            { label: "Cap Actions", value: stats.capReachedCount.toLocaleString(), sub: "Launch cap safeguards", icon: <ShieldAlert className="h-4 w-4 text-red-400" />, accent: "text-red-500" },
            { label: "Conversion", value: data?.conversions ? `${data.conversions.conversion_rate}%` : "0.0%", sub: data?.conversions ? `${data.conversions.conversions_count} leads converted` : "Nurtured → active", icon: <TrendingUp className="h-4 w-4 text-violet-500" />, accent: "text-violet-600" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white border border-[#E4E7EF] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{kpi.label}</span>
                {kpi.icon}
              </div>
              <div className={`text-2xl font-bold ${kpi.accent}`}>{kpi.value}</div>
              <p className="text-xs text-slate-400 mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </section>

        {/* ── Status + Audit Row ─────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Active phases */}
          <div className="lg:col-span-2 bg-white border border-[#E4E7EF] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Phases</span>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span><strong className="text-slate-700">20d</strong> stale</span>
                <span className="w-px h-3 bg-slate-200" />
                <span><strong className="text-slate-700">14d</strong> cadence</span>
                <span className="w-px h-3 bg-slate-200" />
                <span><strong className="text-slate-700">25/run</strong> cap</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                "Agent Reminders (Phase 1)",
                "Pond Nurture (Phase 2)",
                "Stale Reassignments",
                "Click-to-Text",
                "Keyword Scanning",
                "Note Logging",
              ].map((label) => (
                <span key={label} className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
                  <CheckCircle className="h-3 w-3" />
                  {label}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
                <ShieldAlert className="h-3 w-3" />
                SMS Disabled
              </span>
            </div>
          </div>

          {/* System health audit */}
          <div className="bg-white border border-[#E4E7EF] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">System Health</span>
              {auditData && (
                <Badge
                  variant="outline"
                  className={`text-xs font-bold ${
                    auditData.clean
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }`}
                >
                  {auditData.score_pct}%
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mb-3">
              <div className={`p-1.5 rounded-lg border ${
                auditLoading ? "bg-slate-50 border-slate-200 text-slate-400"
                : auditData?.clean ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                : auditData ? "bg-red-50 border-red-200 text-red-600"
                : "bg-slate-50 border-slate-200 text-slate-400"
              }`}>
                {auditLoading ? <Loader2 className="h-4 w-4 animate-spin" />
                  : auditData?.clean ? <CheckCircle className="h-4 w-4" />
                  : <AlertCircle className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  {auditLoading && !auditData ? "Loading…"
                    : auditData?.never_run ? "No audit run yet"
                    : auditData?.clean ? `All ${auditData.total} checks passed`
                    : auditData ? `${auditData.failures?.length ?? 0} failure${(auditData.failures?.length ?? 0) !== 1 ? "s" : ""} — ${auditData.passed}/${auditData.total} passed`
                    : "Status unavailable"}
                </p>
                <p className="text-[10px] text-slate-400">
                  {auditData?.run_at ? `Last run: ${new Date(auditData.run_at).toLocaleString()}` : ""}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs flex-1 border-[#E4E7EF] text-slate-500" onClick={fetchAuditStatus} disabled={auditLoading || auditRunning}>
                <RefreshCw className={`h-3 w-3 mr-1 ${auditLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" className="h-7 text-xs flex-1 bg-slate-900 hover:bg-slate-800 text-white" onClick={handleRunAudit} disabled={auditRunning || auditLoading}>
                {auditRunning ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Running…</> : <><Activity className="h-3 w-3 mr-1" />Run Audit</>}
              </Button>
            </div>
          </div>
        </section>

        {/* ── Agent Command Center ───────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#0F1117]">Agent Command Center</h2>
              <p className="text-xs text-slate-400 mt-0.5">Live pipeline status — click any card to open their personal dashboard</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs text-slate-500 border-[#E4E7EF] bg-white shadow-none"
                onClick={() => refreshRosterMutation.mutate()} disabled={refreshRosterMutation.isPending || rosterLoading}>
                <RefreshCw className={`h-3 w-3 ${refreshRosterMutation.isPending ? "animate-spin" : ""}`} />
                {refreshRosterMutation.isPending ? "Fetching…" : "Refresh"}
              </Button>
              <Link href="/agents">
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs text-slate-500 border-[#E4E7EF] bg-white shadow-none">
                  <Users className="h-3 w-3" />
                  Directory
                </Button>
              </Link>
            </div>
          </div>

          {rosterLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-36 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : rosterData?.roster && rosterData.roster.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {rosterData.roster.map((agent) => {
                const isOwner = agent.slug === "peter";
                const gradient = AGENT_GRADIENTS[agent.slug] ?? "from-slate-500 to-slate-700";
                const urgencyBorder = agent.do_now > 5 ? "border-red-200" : agent.do_now > 0 ? "border-amber-200" : "border-[#E4E7EF]";

                return (
                  <Link key={agent.slug} href={`/agent/${agent.slug}`}>
                    <div className={`bg-white border ${urgencyBorder} rounded-xl p-4 cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group`}>
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                          {agent.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-sm text-[#0F1117] truncate">{agent.name}</span>
                            {isOwner && <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">Owner</span>}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{agent.total} leads</div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-300 ml-auto flex-shrink-0 group-hover:text-slate-500 transition-colors" />
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <div className={`rounded-lg p-1.5 text-center ${agent.do_now > 0 ? "bg-red-50" : "bg-slate-50"}`}>
                          <div className={`text-base font-bold leading-none ${agent.do_now > 0 ? "text-red-600" : "text-slate-400"}`}>{agent.do_now}</div>
                          <div className="text-[8px] font-semibold uppercase tracking-wider mt-0.5 text-slate-400">Now</div>
                        </div>
                        <div className={`rounded-lg p-1.5 text-center ${agent.hot_prospect > 0 ? "bg-amber-50" : "bg-slate-50"}`}>
                          <div className={`text-base font-bold leading-none ${agent.hot_prospect > 0 ? "text-amber-600" : "text-slate-400"}`}>{agent.hot_prospect}</div>
                          <div className="text-[8px] font-semibold uppercase tracking-wider mt-0.5 text-slate-400">Hot</div>
                        </div>
                        <div className="rounded-lg p-1.5 text-center bg-slate-50">
                          <div className="text-base font-bold leading-none text-slate-600">{agent.your_leads}</div>
                          <div className="text-[8px] font-semibold uppercase tracking-wider mt-0.5 text-slate-400">Total</div>
                        </div>
                      </div>

                      {(agent.never_contacted > 0 || agent.avg_days_stale > 0) && (
                        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-slate-100 text-[10px] text-slate-400">
                          {agent.never_contacted > 0 && (
                            <span className="flex items-center gap-0.5 text-red-500">
                              <AlertOctagon className="h-2.5 w-2.5" />{agent.never_contacted} new
                            </span>
                          )}
                          {agent.avg_days_stale > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />{agent.avg_days_stale}d avg
                            </span>
                          )}
                          {agent.last_active_lead_days !== null && (
                            <span className="flex items-center gap-0.5 text-emerald-600 ml-auto">
                              <Flame className="h-2.5 w-2.5" />{agent.last_active_lead_days}d
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}

              {/* Lifestyle Bot card */}
              {(() => {
                const botAgent = botStatus?.agents?.find((a: { isBot: boolean }) => a.isBot);
                const todayCount = botAgent?.todayCount ?? 0;
                const weekCount = botAgent?.weekCount ?? 0;
                const goal = botAgent?.goal ?? 15;
                const pct = botAgent?.pct ?? 0;
                return (
                  <div className="bg-white border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 select-none">🤖</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-sm text-[#0F1117]">Lifestyle Bot</span>
                          <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 flex-shrink-0">AUTO</span>
                        </div>
                        <div className="text-[10px] text-slate-400">{weekCount} this week</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                      <div className={`rounded-lg p-1.5 text-center ${todayCount > 0 ? "bg-emerald-50" : "bg-slate-50"}`}>
                        <div className={`text-base font-bold leading-none ${todayCount > 0 ? "text-emerald-600" : "text-slate-400"}`}>{todayCount}</div>
                        <div className="text-[8px] font-semibold uppercase tracking-wider mt-0.5 text-slate-400">Today</div>
                      </div>
                      <div className="rounded-lg p-1.5 text-center bg-slate-50">
                        <div className="text-base font-bold leading-none text-slate-600">{goal}</div>
                        <div className="text-[8px] font-semibold uppercase tracking-wider mt-0.5 text-slate-400">Goal</div>
                      </div>
                      <div className="rounded-lg p-1.5 text-center bg-slate-50">
                        <div className="text-base font-bold leading-none text-slate-600">{weekCount}</div>
                        <div className="text-[8px] font-semibold uppercase tracking-wider mt-0.5 text-slate-400">Week</div>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1">
                      <div className="h-1 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#94a3b8" }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>Daily progress</span>
                      <span className={pct >= 100 ? "text-emerald-600 font-semibold" : ""}>{pct}%</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="bg-white border border-[#E4E7EF] rounded-xl p-8 text-center text-slate-400 text-sm">
              <Users className="h-7 w-7 mx-auto mb-2 stroke-1" />
              <p>Agent roster loading — FUB API call in progress.</p>
            </div>
          )}
        </section>

        {/* ── Lifestyle Bot Panel ────────────────────────────────────────────── */}
        <LifestyleBotPanel />

        {/* ── Analytics Tabs ────────────────────────────────────────────────── */}
        <Tabs defaultValue="overview" className="space-y-4" onValueChange={setActiveTab}>
          <div className="border-b border-[#E4E7EF]">
            <TabsList className="flex gap-1 -mb-px bg-transparent p-0">
              {[
                { value: "overview", label: "Performance" },
                { value: "personalization", label: "City Personalization" },
                { value: "suppressions", label: "Suppressions" },
                { value: "logs", label: "Audit Logs" },
              ].map(tab => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={`pb-3 px-3 text-xs font-medium border-b-2 transition-all cursor-pointer rounded-none bg-transparent ${
                    activeTab === tab.value
                      ? "border-amber-500 text-amber-600 font-semibold"
                      : "border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Performance Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2 bg-white border-[#E4E7EF] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#0F1117]">Automation Timeline — Last 30 Days</CardTitle>
                  <CardDescription className="text-xs">Sends and reassignments trended over time</CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  {timelineData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">No timeline data in the last 30 days.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timelineData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                        <YAxis stroke="#94a3b8" fontSize={10} />
                        <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E4E7EF", borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="sent" stroke="#2563EB" name="Emails Sent" strokeWidth={2} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="reassignments" stroke="#10B981" name="Reassignments" strokeWidth={2} />
                        <Line type="monotone" dataKey="suppressed" stroke="#F59E0B" name="Suppressed" strokeWidth={1.5} strokeDasharray="4 4" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white border-[#E4E7EF] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#0F1117]">Action Mix</CardTitle>
                  <CardDescription className="text-xs">Sent vs suppressed vs capped</CardDescription>
                </CardHeader>
                <CardContent className="h-72 flex flex-col items-center justify-center">
                  {stats.sentEmails === 0 && stats.suppressedEmails === 0 ? (
                    <div className="text-slate-400 text-sm">No email actions recorded.</div>
                  ) : (
                    <>
                      <div className="w-full h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={[
                              { name: "Sent", value: stats.sentEmails },
                              { name: "Suppressed", value: stats.suppressedEmails },
                              { name: "Capped", value: stats.capReachedCount },
                            ]} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value">
                              <Cell fill="#2563EB" />
                              <Cell fill="#F59E0B" />
                              <Cell fill="#EF4444" />
                            </Pie>
                            <Tooltip contentStyle={{ fontSize: 11 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center text-xs mt-2 w-full">
                        <div><div className="font-bold text-blue-600">{stats.sentEmails}</div><div className="text-slate-400">Sent</div></div>
                        <div><div className="font-bold text-amber-600">{stats.suppressedEmails}</div><div className="text-slate-400">Suppressed</div></div>
                        <div><div className="font-bold text-red-500">{stats.capReachedCount}</div><div className="text-slate-400">Capped</div></div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Agent Click Leaderboard */}
            {data.agent_clicks && data.agent_clicks.by_agent.length > 0 && (
              <Card className="bg-white border-[#E4E7EF] shadow-none">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold text-[#0F1117]">Tap-to-Text Leaderboard</CardTitle>
                      <CardDescription className="text-xs">Agent click-through engagement</CardDescription>
                    </div>
                    <Badge variant="outline" className="text-xs font-mono bg-slate-50 text-slate-600 border-[#E4E7EF]">
                      {data.agent_clicks.total_clicks} total clicks
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.agent_clicks.by_agent.map((item, idx) => {
                      const maxClicks = Math.max(...data.agent_clicks!.by_agent.map(a => a.clicks), 1);
                      const pct = (item.clicks / maxClicks) * 100;
                      let relativeTime = "Never";
                      if (item.last_click) {
                        try {
                          const diffMs = Date.now() - new Date(item.last_click).getTime();
                          const diffMins = Math.floor(diffMs / 60000);
                          const diffHours = Math.floor(diffMins / 60);
                          const diffDays = Math.floor(diffHours / 24);
                          relativeTime = diffMins < 1 ? "Just now" : diffMins < 60 ? `${diffMins}m ago` : diffHours < 24 ? `${diffHours}h ago` : `${diffDays}d ago`;
                        } catch { relativeTime = "Unknown"; }
                      }
                      return (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-700">
                              {idx === 0 ? "👑 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : ""}{item.agent}
                              <span className="text-slate-400 font-normal ml-2">· {relativeTime}</span>
                            </span>
                            <span className="font-bold text-slate-900">{item.clicks}</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Conversion breakdown */}
            {data.conversions && data.conversions.stages_breakdown && data.conversions.stages_breakdown.length > 0 && (
              <Card className="bg-white border-[#E4E7EF] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#0F1117]">Nurture Conversion Stages</CardTitle>
                  <CardDescription className="text-xs">Current FUB stages of leads who received pond nurture emails</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {data.conversions.stages_breakdown.map((item, idx) => {
                      const isConverted = ["Showing", "Pending", "Closed", "Hot Prospect", "Active Client", "Past Client", "Sphere", "Contract"].includes(item.stage);
                      return (
                        <div key={idx} className={`p-3 rounded-xl border flex items-center justify-between ${
                          isConverted ? "bg-violet-50 border-violet-100" : "bg-slate-50 border-[#E4E7EF]"
                        }`}>
                          <div>
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">{item.stage}</span>
                            <span className="text-xl font-bold mt-0.5 block text-[#0F1117]">{item.count}</span>
                          </div>
                          <Badge variant="outline" className={`text-[10px] ${isConverted ? "bg-violet-100 text-violet-700 border-violet-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                            {isConverted ? "Converted" : "Nurturing"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* City Personalization Tab */}
          <TabsContent value="personalization" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-white border-[#E4E7EF] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#0F1117] flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-500" />
                    City Personalization Distribution
                  </CardTitle>
                  <CardDescription className="text-xs">Top cities extracted from lead notes</CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  {cityData.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                      <MapPin className="h-7 w-7 stroke-1" />
                      <span>No city personalization records yet.</span>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={cityData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis type="number" stroke="#94a3b8" fontSize={10} />
                        <YAxis dataKey="city" type="category" stroke="#94a3b8" fontSize={10} width={90} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white border-[#E4E7EF] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#0F1117] flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    City Inference Sources
                  </CardTitle>
                  <CardDescription className="text-xs">Where personalization data was sourced</CardDescription>
                </CardHeader>
                <CardContent className="h-72 flex flex-col items-center justify-center">
                  {data.city_sources.length === 0 ? (
                    <div className="text-slate-400 text-sm">No source data recorded yet.</div>
                  ) : (
                    <div className="w-full h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data.city_sources} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="count" nameKey="source">
                            {data.city_sources.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Suppressions Tab */}
          <TabsContent value="suppressions" className="space-y-4">
            <Card className="bg-white border-[#E4E7EF] shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#0F1117] flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  Safety Suppression Reasons
                </CardTitle>
                <CardDescription className="text-xs">Why emails or reassignments were bypassed</CardDescription>
              </CardHeader>
              <CardContent>
                {suppressionData.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm">No safety suppressions logged yet.</div>
                ) : (
                  <div className="space-y-4">
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={suppressionData.slice(0, 5)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                          <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                          <YAxis stroke="#94a3b8" fontSize={10} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          <Bar dataKey="value" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={36} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="border border-[#E4E7EF] rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-[#E4E7EF] text-slate-500 font-medium">
                            <th className="p-3">Suppression Reason</th>
                            <th className="p-3 text-right">Leads Shielded</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F1F5F9]">
                          {suppressionData.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="p-3 font-medium text-slate-700">{item.name}</td>
                              <td className="p-3 text-right font-bold text-amber-600">{item.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="logs" className="space-y-4">
            <Card className="bg-white border-[#E4E7EF] shadow-none">
              <CardHeader className="pb-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-semibold text-[#0F1117]">Live Audit History</CardTitle>
                    <CardDescription className="text-xs">Recent actions executed by the background automation</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search lead ID or details…"
                        className="pl-8 pr-3 py-1.5 h-8 w-52 border border-[#E4E7EF] rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <select className="h-8 px-2 border border-[#E4E7EF] rounded-lg text-xs bg-white focus:outline-none" value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
                      <option value="all">All Actions</option>
                      <option value="pond_nurture">Pond Nurture</option>
                      <option value="stale_agent_pond_reassignment">Reassignment</option>
                      <option value="agent_followup_reminder">Agent Reminder</option>
                    </select>
                    <select className="h-8 px-2 border border-[#E4E7EF] rounded-lg text-xs bg-white focus:outline-none" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                      <option value="all">All Statuses</option>
                      <option value="sent">Sent</option>
                      <option value="suppressed">Suppressed</option>
                      <option value="skipped">Skipped</option>
                      <option value="launch_cap_reached">Capped</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border border-[#E4E7EF] rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-[#E4E7EF] text-slate-500 font-medium">
                        <th className="p-3 w-32">Timestamp</th>
                        <th className="p-3 w-40">Action</th>
                        <th className="p-3 w-24">Status</th>
                        <th className="p-3 w-20">Lead ID</th>
                        <th className="p-3">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {filteredActivity.length === 0 ? (
                        <tr><td colSpan={5} className="p-8 text-center text-slate-400">No matching audit logs found.</td></tr>
                      ) : (
                        filteredActivity.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-3 text-slate-400 font-mono whitespace-nowrap">{new Date(item.created_at).toLocaleString()}</td>
                            <td className="p-3 font-medium text-slate-700">
                              {item.action === "pond_nurture" && "Pond Nurture Email"}
                              {item.action === "stale_agent_pond_reassignment" && "Stale Reassignment"}
                              {item.action === "agent_followup_reminder" && "Agent Reminder"}
                              {item.action === "phase2_daily_summary" && "Daily Summary"}
                            </td>
                            <td className="p-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                item.status === "sent" || item.status === "completed" || item.status === "email_digest_sent"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                  : item.status === "suppressed"
                                  ? "bg-amber-50 text-amber-700 border border-amber-100"
                                  : item.status === "launch_cap_reached"
                                  ? "bg-red-50 text-red-700 border border-red-100"
                                  : "bg-slate-50 text-slate-600 border border-slate-200"
                              }`}>
                                {(item.status === "sent" || item.status === "completed") && <Check className="h-2.5 w-2.5" />}
                                {item.status === "launch_cap_reached" && <AlertCircle className="h-2.5 w-2.5" />}
                                {item.status}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-slate-500">
                              {item.person_id ? (
                                <a href={`https://lifestyledesignrealty.followupboss.com/2/people/view/${item.person_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline font-semibold">
                                  #{item.person_id}
                                </a>
                              ) : "—"}
                            </td>
                            <td className="p-3 text-slate-500 max-w-xs truncate">
                              <span className="font-mono text-[10px]">{JSON.stringify(item.details)}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </main>
    </div>
  );
}
