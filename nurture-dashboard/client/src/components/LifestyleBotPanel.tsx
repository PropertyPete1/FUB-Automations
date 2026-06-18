import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bot, Zap, RefreshCw, TrendingUp, MessageSquare, Users, Clock, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Mail, Phone, Calendar, Activity, Search, ShieldCheck, TriangleAlert, Wrench, Eye, Radio } from "lucide-react";

// ── Colour map per agent ────────────────────────────────────────────────────
const AGENT_COLORS: Record<string, { bar: string; text: string; bg: string }> = {
  "Peter":         { bar: "bg-amber-500",   text: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  "Steven":        { bar: "bg-blue-500",    text: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
  "Tiffany":       { bar: "bg-violet-500",  text: "text-violet-700",  bg: "bg-violet-50 border-violet-200" },
  "Stefanie":      { bar: "bg-rose-500",    text: "text-rose-700",    bg: "bg-rose-50 border-rose-200" },
  "Abby":          { bar: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  "Irma":          { bar: "bg-orange-500",  text: "text-orange-700",  bg: "bg-orange-50 border-orange-200" },
  "Laila":         { bar: "bg-cyan-500",    text: "text-cyan-700",    bg: "bg-cyan-50 border-cyan-200" },
  "Lifestyle Bot": { bar: "bg-purple-500",  text: "text-purple-700",  bg: "bg-purple-50 border-purple-200" },
};

// ── Types ───────────────────────────────────────────────────────────────────
interface RunRecord {
  id: number;
  runAt: Date;
  leadsTexted: number;
  leadsFailed: number;
  leadsEvaluated: number;
  emailSent: string;
  summary: string;
  triggeredBy: string;
  createdAt: Date;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

// ── Last run result modal ───────────────────────────────────────────────────
interface BotResult {
  ranAt: string;
  leadsProcessed: number;
  leadsSkipped: number;
  leadsErrored: number;
  durationMs: number;
  summaryEmailSent: boolean;
  results: Array<{
    personId: number;
    name: string;
    phone: string;
    daysStale: number;
    draftMessage: string;
    notePosted: boolean;
    recorded: boolean;
    error?: string;
  }>;
}

function BotResultModal({ result, onClose }: { result: BotResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Bot className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-bold text-[#0F1117]">Lifestyle Bot Run Complete</h3>
              <p className="text-xs text-slate-400">{new Date(result.ranAt).toLocaleString()}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl font-bold leading-none">×</button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-emerald-700">{result.leadsProcessed}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mt-0.5">Texted</div>
          </div>
          <div className="bg-slate-50 border border-[#E4E7EF] rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-slate-300">{result.leadsSkipped}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">Skipped</div>
          </div>
          <div className={`rounded-xl p-3 text-center border ${result.leadsErrored > 0 ? "bg-red-50 border-red-100" : "bg-slate-50 border-[#E4E7EF]"}`}>
            <div className={`text-2xl font-bold ${result.leadsErrored > 0 ? "text-red-600" : "text-slate-500"}`}>{result.leadsErrored}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">Errors</div>
          </div>
        </div>

        <div className="text-xs text-slate-400 flex items-center justify-between border-t pt-3">
          <span>Duration: {(result.durationMs / 1000).toFixed(1)}s</span>
          <span className={result.summaryEmailSent ? "text-emerald-600 font-medium" : "text-slate-500"}>
            {result.summaryEmailSent ? "✓ Summary email sent" : "Email not sent"}
          </span>
        </div>

        {/* Lead results */}
        {result.results.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Leads Processed</h4>
            {result.results.map((r, i) => (
              <div key={i} className={`rounded-lg border p-3 text-xs space-y-1 ${r.error ? "bg-red-50 border-red-100" : "bg-slate-50 border-[#E4E7EF]"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">{r.name}</span>
                  <span className="text-slate-500">{r.daysStale}d stale</span>
                </div>
                {r.error ? (
                  <p className="text-red-600">{r.error}</p>
                ) : (
                  <p className="text-slate-300 italic">"{r.draftMessage}"</p>
                )}
                <div className="flex gap-2 text-[10px] text-slate-500">
                  {r.notePosted && <span className="text-emerald-600">✓ FUB note posted</span>}
                  {r.recorded && <span className="text-emerald-600">✓ Recorded in DB</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <Button onClick={onClose} variant="outline" className="w-full">Close</Button>
      </div>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────
export default function LifestyleBotPanel() {
  const [botResult, setBotResult] = useState<BotResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showMonitor, setShowMonitor] = useState(false);
  const [showObsFeed, setShowObsFeed] = useState(false);
  const [monitorResult, setMonitorResult] = useState<null | {
    ranAt: string;
    durationMs: number;
    checksRun: number;
    issuesFound: number;
    issuesFixed: number;
    findings: Array<{ check: string; status: string; detail: string }>;
    summary: string;
    triggeredBy: string;
  }>(null);

  const { data: dashStats } = trpc.fub.getDashboardStats.useQuery(undefined, {
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const { data, isLoading, refetch, isRefetching } = trpc.bot.getStatus.useQuery(undefined, {
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  const { data: runHistory, refetch: refetchHistory } = trpc.bot.getRunHistory.useQuery(undefined, {
    staleTime: 60 * 1000,
  });

  const { data: monitorHistory, refetch: refetchMonitor } = trpc.bot.getMonitorStatus.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const runMonitorMutation = trpc.bot.runMonitorNow.useMutation({
    onSuccess: (result) => {
      setMonitorResult(result);
      void refetchMonitor();
      const icon = result.issuesFound === 0 ? "✅" : result.findings.some(f => f.status === "error") ? "🔴" : "⚠️";
      toast.success(`${icon} Monitor complete — ${result.checksRun} checks`, {
        description: result.summary,
      });
    },
    onError: (err) => {
      toast.error("Monitor run failed", { description: err.message });
    },
  });

  const lastMonitorRun = monitorHistory && monitorHistory.length > 0 ? monitorHistory[0] : null;

  // ── Bot Observer Network feed ──────────────────────────────────────────────
  const { data: observations, refetch: refetchObs } = trpc.bot.getObservations.useQuery(
    { limit: 60, hoursBack: 25 },
    { staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000 }
  );

  const markObsFixedMutation = trpc.bot.markObsFixed.useMutation({
    onSuccess: () => { void refetchObs(); toast.success("Observation marked as fixed"); },
    onError: (err) => toast.error("Could not mark fixed", { description: err.message }),
  });

  const obsErrors   = (observations ?? []).filter(o => o.severity === "error");
  const obsWarnings = (observations ?? []).filter(o => o.severity === "warning");
  const obsFixed    = (observations ?? []).filter(o => o.severity === "fixed");
  const obsInfo     = (observations ?? []).filter(o => o.severity === "info");
  const obsTotal    = (observations ?? []).length;

  const runBotMutation = trpc.bot.runNow.useMutation({
    onSuccess: (result) => {
      setBotResult(result as BotResult);
      void refetch();
      void refetchHistory();
      toast.success(`Lifestyle Bot complete — ${result.leadsProcessed} leads texted`, {
        description: result.summaryEmailSent ? "Summary email sent to Peter." : undefined,
      });
    },
    onError: (err) => {
      toast.error("Lifestyle Bot failed", { description: err.message });
    },
  });

  const BOT_MAX_PER_RUN = 15; // hard cap in lifestyleBot.ts — not a daily goal
  const lastRun = runHistory && runHistory.length > 0 ? runHistory[0] : null;

  // Compute bot-only text stats from run history
  const botTextToday = data?.agents.find(a => a.isBot)?.todayCount ?? 0;
  const botTextWeek = data?.agents.find(a => a.isBot)?.weekCount ?? 0;
  const allTimeTexted = (runHistory as RunRecord[] | undefined)?.reduce((s, r) => s + r.leadsTexted, 0) ?? 0;
  const allTimeRuns = (runHistory as RunRecord[] | undefined)?.length ?? 0;

  // Live pond nurture stats from SQLite (30s TTL)
  const pondEmailToday = dashStats?.live_stats?.pond_nurture_today ?? null;
  const pondSmsToday = dashStats?.live_stats?.pond_nurture_sms_today ?? null;
  const pondEmailAllTime = dashStats?.live_stats?.pond_nurture_sent ?? null;

  return (
    <>
      {botResult && <BotResultModal result={botResult} onClose={() => setBotResult(null)} />}

      <Card className="bg-white border-[#E4E7EF] shadow-sm overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Bot icon */}
              <div className="p-2.5 bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl shadow-sm">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-[#0F1117] flex items-center gap-2">
                  Lifestyle Bot Command Center
                  <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] font-semibold">
                    8th Agent
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Daily SMS counts for all agents + the Lifestyle Bot · Bot max: {BOT_MAX_PER_RUN}/run
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void refetch(); void refetchHistory(); }}
                disabled={isRefetching}
                className="text-xs h-8"
              >
                <RefreshCw className={`h-3 w-3 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => runBotMutation.mutate()}
                disabled={runBotMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-8 gap-1.5"
              >
                {runBotMutation.isPending ? (
                  <><RefreshCw className="h-3 w-3 animate-spin" /> Running…</>
                ) : (
                  <><Zap className="h-3 w-3" /> Run Bot Now</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-4">

          {/* ── Last Run Banner ─────────────────────────────────────────── */}
          {lastRun ? (
            <div
              className={`flex items-center justify-between rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                lastRun.leadsFailed > 0
                  ? "bg-red-50 border-red-200 hover:bg-red-100"
                  : "bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
              }`}
              onClick={() => setShowHistory(v => !v)}
            >
              <div className="flex items-center gap-3">
                {lastRun.leadsFailed > 0 ? (
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                )}
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    Last run: {formatRelativeTime(lastRun.runAt)} —{" "}
                    <span className="text-emerald-700">{lastRun.leadsTexted} leads texted</span>
                    {lastRun.leadsFailed > 0 && (
                      <span className="text-red-600 ml-1">· {lastRun.leadsFailed} failed</span>
                    )}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(lastRun.runAt).toLocaleString()} · {lastRun.triggeredBy === "manual" ? "Manual trigger" : "Scheduled"}
                    {lastRun.emailSent === "yes" && " · Email sent ✓"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium">History</span>
                {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-[#E4E7EF] bg-slate-50 px-4 py-3">
              <Clock className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <p className="text-xs text-slate-400">
                No runs recorded yet. Click <strong>Run Bot Now</strong> or wait for the scheduled 10am CT run.
              </p>
            </div>
          )}

          {/* ── Run History Drawer ──────────────────────────────────────── */}
          {showHistory && runHistory && runHistory.length > 0 && (
            <div className="rounded-xl border border-[#E4E7EF] overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-[#E4E7EF]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recent Bot Runs</p>
              </div>
              <div className="divide-y divide-stone-100">
                {(runHistory as RunRecord[]).map((run) => (
                  <div key={run.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${run.leadsFailed > 0 ? "bg-red-400" : "bg-emerald-400"}`} />
                      <div>
                        <p className="text-xs font-medium text-slate-800">
                          {run.leadsTexted} texted
                          {run.leadsFailed > 0 && <span className="text-red-500 ml-1">· {run.leadsFailed} failed</span>}
                        </p>
                        <p className="text-[10px] text-slate-500">{new Date(run.runAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {run.emailSent === "yes" && (
                        <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[9px] py-0 px-1.5">Email ✓</Badge>
                      )}
                      <Badge className={`text-[9px] py-0 px-1.5 ${run.triggeredBy === "manual" ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-slate-100 text-slate-400 border-[#E4E7EF]"}`}>
                        {run.triggeredBy === "manual" ? "Manual" : "Scheduled"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary row */}
          {data && (
            <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-[#E4E7EF]">
              <div className="text-center">
                <div className="text-2xl font-bold text-[#0F1117]">{data.totalToday}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">Total Today</div>
              </div>
              <div className="text-center border-x border-[#E4E7EF]">
                <div className="text-2xl font-bold text-[#0F1117]">{data.totalWeek}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">This Week</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[#0F1117]">
                  {data.agents.filter(a => a.isBot ? a.todayCount >= BOT_MAX_PER_RUN : a.todayCount >= 10).length}
                  <span className="text-sm font-normal text-slate-500">/{data.agents.length}</span>
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">Hit Goal</div>
              </div>
            </div>
          )}

          {/* Agent rows */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : data ? (
            <div className="space-y-2.5">
              {/* Sort: bot first, then by today count desc */}
              {[...data.agents]
                .sort((a, b) => {
                  if (a.isBot && !b.isBot) return -1;
                  if (!a.isBot && b.isBot) return 1;
                  return b.todayCount - a.todayCount;
                })
                .map((agent) => {
                  const colors = AGENT_COLORS[agent.name] ?? { bar: "bg-stone-400", text: "text-slate-300", bg: "bg-slate-50 border-[#E4E7EF]" };
                  const agentGoal = agent.isBot ? BOT_MAX_PER_RUN : 10;
                  const pct = Math.min(100, Math.round((agent.todayCount / agentGoal) * 100));
                  const hitGoal = agent.todayCount >= agentGoal;
                  const initials = agent.isBot ? "🤖" : agent.name.slice(0, 2).toUpperCase();

                  return (
                    <div
                      key={agent.name}
                      className={`rounded-xl border p-3.5 transition-all duration-200 ${
                        agent.isBot
                          ? "bg-gradient-to-r from-purple-50 to-purple-50/30 border-purple-200"
                          : colors.bg
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                          agent.isBot
                            ? "bg-gradient-to-br from-purple-600 to-purple-800 text-white"
                            : `bg-gradient-to-br ${
                                agent.name === "Peter" ? "from-yellow-500 to-amber-700" :
                                agent.name === "Steven" ? "from-blue-600 to-blue-800" :
                                agent.name === "Tiffany" ? "from-violet-600 to-violet-800" :
                                agent.name === "Stefanie" ? "from-rose-600 to-rose-800" :
                                agent.name === "Abby" ? "from-emerald-600 to-emerald-800" :
                                agent.name === "Irma" ? "from-amber-600 to-amber-800" :
                                "from-cyan-600 to-cyan-800"
                              } text-white`
                        }`}>
                          {initials}
                        </div>

                        {/* Name + bar */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-[#0F1117]">{agent.name}</span>
                              {agent.isBot && (
                                <Badge className="bg-purple-100 text-purple-600 border-purple-200 text-[9px] py-0 px-1.5">AUTO</Badge>
                              )}
                              {hitGoal && (
                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px] py-0 px-1.5">✓ Goal</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-slate-500">
                                <MessageSquare className="h-3 w-3 inline mr-0.5" />
                                <span className="font-semibold text-slate-700">{agent.todayCount}</span>
                                <span className="text-slate-500"> today</span>
                              </span>
                              <span className="text-slate-500 hidden sm:inline">
                                <TrendingUp className="h-3 w-3 inline mr-0.5" />
                                <span className="font-semibold text-slate-300">{agent.weekCount}</span>
                                <span className="text-slate-500"> wk</span>
                              </span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${
                                hitGoal
                                  ? "bg-emerald-500"
                                  : agent.isBot
                                  ? "bg-purple-500"
                                  : colors.bar
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 text-sm">
              <Users className="h-8 w-8 mx-auto mb-2 stroke-1" />
              <p>Could not load bot status. Check server connection.</p>
            </div>
          )}

          {/* ── Bot Activity Stats ─────────────────────────────────────── */}
          <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50/60 to-purple-50/20 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-3.5 w-3.5 text-purple-600" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-700">Bot Activity Overview</span>
            </div>

            {/* Two-channel grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* SMS channel */}
              <div className="bg-white/80 rounded-lg border border-purple-100 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-purple-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Auto-Texts (SMS)</span>
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-2xl font-bold text-[#0F1117]">{botTextToday}</span>
                  <span className="text-xs text-slate-500 mb-0.5">today</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  <span className="font-semibold text-slate-700">{botTextWeek}</span> this week
                  {allTimeTexted > 0 && <> · <span className="font-semibold text-slate-700">{allTimeTexted}</span> all-time</>}
                  {allTimeRuns > 0 && <div className="text-[10px] text-slate-500 mt-0.5">{allTimeRuns} total runs · FUB note posted after every text</div>}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Calendar className="h-3 w-3 text-slate-500" />
                  <span className="text-[10px] text-slate-500">Daily 10am CT (incl. weekends) · Max {BOT_MAX_PER_RUN}/run</span>
                </div>
              </div>

              {/* Email + SMS channel */}
              <div className="bg-white/80 rounded-lg border border-purple-100 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-purple-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pond Emails</span>
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-2xl font-bold text-[#0F1117]">
                    {pondEmailToday !== null ? pondEmailToday : "—"}
                  </span>
                  <span className="text-xs text-slate-500 mb-0.5">today</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  {pondSmsToday !== null && pondSmsToday > 0 && (
                    <><span className="font-semibold text-slate-700">{pondSmsToday}</span> SMS today · </>
                  )}
                  {pondEmailAllTime !== null
                    ? <><span className="font-semibold text-slate-700">{pondEmailAllTime.toLocaleString()}</span> all-time sent</>
                    : <span className="text-slate-500">Loading…</span>
                  }
                  {" · "}<span className="font-semibold text-slate-700">14-day</span> cadence
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Calendar className="h-3 w-3 text-slate-500" />
                  <span className="text-[10px] text-slate-500">Daily 8am CT · cap 100/day</span>
                </div>
              </div>
            </div>

            {/* Cron schedule summary */}
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex items-center gap-1.5 text-slate-400">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                SMS cron: daily 10am CT (incl. weekends)
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                Email cron: daily 8am CT
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                Reads live FUB notes before drafting
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                Posts FUB note after every text & email
              </div>
            </div>
          </div>

          {/* ── System Monitor Section ────────────────────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-slate-50 p-3 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowMonitor(v => !v)}
                className="flex items-center gap-2 text-left group"
              >
                <Search className="h-3.5 w-3.5 text-indigo-600" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
                  System Monitor
                </span>
                {lastMonitorRun && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                    lastMonitorRun.issuesFound === 0
                      ? "bg-emerald-100 text-emerald-700"
                      : lastMonitorRun.findings.some((f: any) => f.status === "error")
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {lastMonitorRun.issuesFound === 0 ? "✓ All clear" : `${lastMonitorRun.issuesFound} issue${lastMonitorRun.issuesFound > 1 ? "s" : ""}`}
                  </span>
                )}
                {showMonitor
                  ? <ChevronUp className="h-3 w-3 text-indigo-400 group-hover:text-indigo-600 transition-colors" />
                  : <ChevronDown className="h-3 w-3 text-indigo-400 group-hover:text-indigo-600 transition-colors" />}
              </button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 bg-white"
                onClick={() => runMonitorMutation.mutate()}
                disabled={runMonitorMutation.isPending}
              >
                {runMonitorMutation.isPending
                  ? <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                  : <Search className="h-3 w-3 mr-1" />}
                {runMonitorMutation.isPending ? "Scanning..." : "Run Now"}
              </Button>
            </div>

            {/* Last run summary row (always visible) */}
            {lastMonitorRun && (
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Last: {formatRelativeTime(lastMonitorRun.runAt)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-indigo-400" />
                  <span>{lastMonitorRun.checksRun} checks</span>
                </div>
                {lastMonitorRun.issuesFixed > 0 && (
                  <div className="flex items-center gap-1 text-blue-600">
                    <Wrench className="h-3 w-3" />
                    <span>{lastMonitorRun.issuesFixed} auto-fixed</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-slate-500">
                  <span>{lastMonitorRun.durationMs}ms</span>
                </div>
              </div>
            )}

            {!lastMonitorRun && !runMonitorMutation.isPending && (
              <p className="text-[10px] text-slate-500 italic">No monitor runs yet — runs automatically every 30 min via cron, or click Run Now</p>
            )}

            {/* Expanded findings list */}
            {showMonitor && (
              <div className="space-y-1.5">
                {/* Show live result if just ran, otherwise show last DB record */}
                {(monitorResult?.findings ?? lastMonitorRun?.findings ?? []).map((f: { check: string; status: string; detail: string }, i: number) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[10px] ${
                      f.status === "ok" ? "bg-emerald-50 border border-emerald-100"
                      : f.status === "fixed" ? "bg-blue-50 border border-blue-100"
                      : f.status === "warning" ? "bg-amber-50 border border-amber-100"
                      : "bg-red-50 border border-red-100"
                    }`}
                  >
                    <span className="mt-0.5 flex-shrink-0">
                      {f.status === "ok" && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                      {f.status === "fixed" && <Wrench className="h-3 w-3 text-blue-500" />}
                      {f.status === "warning" && <TriangleAlert className="h-3 w-3 text-amber-500" />}
                      {f.status === "error" && <AlertCircle className="h-3 w-3 text-red-500" />}
                    </span>
                    <div className="min-w-0">
                      <span className={`font-semibold ${
                        f.status === "ok" ? "text-emerald-700"
                        : f.status === "fixed" ? "text-blue-700"
                        : f.status === "warning" ? "text-amber-700"
                        : "text-red-700"
                      }`}>{f.check}</span>
                      <span className="text-slate-400 ml-1">— {f.detail}</span>
                    </div>
                  </div>
                ))}

                {/* Run history list */}
                {monitorHistory && monitorHistory.length > 1 && (
                  <div className="pt-2 border-t border-indigo-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Previous Runs</p>
                    {monitorHistory.slice(1).map((run, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px] text-slate-400 py-0.5">
                        <span>{formatRelativeTime(run.runAt)}</span>
                        <span className={run.issuesFound === 0 ? "text-emerald-600" : "text-amber-600"}>
                          {run.issuesFound === 0 ? "✓ All clear" : `${run.issuesFound} issue${run.issuesFound > 1 ? "s" : ""}`}
                        </span>
                        <span className="text-slate-500">{run.checksRun} checks · {run.durationMs}ms</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Schedule note */}
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
              Auto-scans every 30 min · 14 checks across FUB data, bot health, rule violations &amp; system files
            </div>
          </div>

          {/* ── Bot Observer Network Feed ────────────────────────────────────── */}
          <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3 space-y-2">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <button
                className="group flex items-center gap-2 text-[11px] font-semibold text-violet-700 hover:text-violet-900 transition-colors"
                onClick={() => setShowObsFeed(v => !v)}
              >
                <Radio className="h-3.5 w-3.5 text-violet-500" />
                Bot Observer Network
                {obsErrors.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-700">
                    {obsErrors.length} error{obsErrors.length > 1 ? "s" : ""}
                  </span>
                )}
                {obsErrors.length === 0 && obsWarnings.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700">
                    {obsWarnings.length} warning{obsWarnings.length > 1 ? "s" : ""}
                  </span>
                )}
                {obsErrors.length === 0 && obsWarnings.length === 0 && obsTotal > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700">
                    ✓ All clear
                  </span>
                )}
                {showObsFeed
                  ? <ChevronUp className="h-3 w-3 text-violet-400" />
                  : <ChevronDown className="h-3 w-3 text-violet-400" />}
              </button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2 border-violet-200 text-violet-700 hover:bg-violet-100 bg-white"
                onClick={() => void refetchObs()}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </div>

            {/* Summary row (always visible) */}
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                <span>{obsTotal} observation{obsTotal !== 1 ? "s" : ""} (last 25h)</span>
              </div>
              {obsErrors.length > 0 && <span className="text-red-600 font-semibold">{obsErrors.length} error{obsErrors.length > 1 ? "s" : ""}</span>}
              {obsWarnings.length > 0 && <span className="text-amber-600">{obsWarnings.length} warning{obsWarnings.length > 1 ? "s" : ""}</span>}
              {obsFixed.length > 0 && <span className="text-blue-600">{obsFixed.length} fixed</span>}
              {obsInfo.length > 0 && <span className="text-slate-500">{obsInfo.length} info</span>}
            </div>

            {/* Expanded feed */}
            {showObsFeed && (
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {(observations ?? []).length === 0 && (
                  <p className="text-[10px] text-slate-500 italic text-center py-2">No observations yet — bots are running silently</p>
                )}
                {(observations ?? []).map((obs) => (
                  <div
                    key={obs.id}
                    className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[10px] ${
                      obs.severity === "error"   ? "bg-red-50 border border-red-100"
                      : obs.severity === "warning" ? "bg-amber-50 border border-amber-100"
                      : obs.severity === "fixed"   ? "bg-blue-50 border border-blue-100"
                      : "bg-slate-50 border border-[#E4E7EF]"
                    }`}
                  >
                    <span className="mt-0.5 flex-shrink-0">
                      {obs.severity === "error"   && <AlertCircle className="h-3 w-3 text-red-500" />}
                      {obs.severity === "warning"  && <TriangleAlert className="h-3 w-3 text-amber-500" />}
                      {obs.severity === "fixed"    && <Wrench className="h-3 w-3 text-blue-500" />}
                      {obs.severity === "info"     && <CheckCircle className="h-3 w-3 text-slate-500" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-300 uppercase tracking-wider text-[9px]">{obs.source}</span>
                        <span className={`font-medium ${
                          obs.severity === "error" ? "text-red-700"
                          : obs.severity === "warning" ? "text-amber-700"
                          : obs.severity === "fixed" ? "text-blue-700"
                          : "text-slate-300"
                        }`}>{obs.message}</span>
                      </div>
                      {obs.detail && (
                        <p className="text-slate-500 mt-0.5 leading-relaxed">{obs.detail}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-slate-600">{formatRelativeTime(obs.createdAt)}</span>
                        {(obs.severity === "error" || obs.severity === "warning") && (
                          <button
                            className="text-[9px] text-blue-500 hover:text-blue-700 underline"
                            onClick={() => markObsFixedMutation.mutate({ id: obs.id })}
                            disabled={markObsFixedMutation.isPending}
                          >
                            Mark fixed
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Source legend */}
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 flex-wrap">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
              Sources: bot_monitor · lifestyle_bot · speed_to_lead · pond_nurture · nightly_healer
            </div>
          </div>

          {/* Footer note */}
          <p className="text-[11px] text-slate-500 text-center pt-1">
            Lifestyle Bot runs daily at 10am CT (incl. weekends) · Texts pond leads 20+ days stale · Max 15/run · Posts FUB note after every send
          </p>
        </CardContent>
      </Card>
    </>
  );
}
