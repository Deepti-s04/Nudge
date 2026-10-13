import { useState, useEffect } from "react";

interface SessionRecord {
  mode: string;
  startedAt: number;
  endedAt: number;
  duration: number;
  siteUsage: Record<string, number>;
}

interface StorageData {
  sessions?: SessionRecord[];
  isActive?: boolean;
  mode?: string;
  startedAt?: number;
  sessionSiteUsage?: Record<string, number>;
  blockedSites?: string[];
  restrictedSites?: string[];
}

interface DailyBarData {
  dateStr: string;
  dayLabel: string;
  focusMinutes: number;
  distractionMinutes: number;
  isToday: boolean;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function App() {
  const [data, setData] = useState<StorageData>({
    sessions: [],
    isActive: false,
    mode: "block",
    startedAt: 0,
    sessionSiteUsage: {},
    blockedSites: ["twitter.com"],
    restrictedSites: ["youtube.com", "instagram.com"],
  });
  const [filterMode, setFilterMode] = useState<"all" | "block" | "restrict">("all");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());

  const loadData = async () => {
    try {
      const stored = (await browser.storage.local.get([
        "sessions",
        "isActive",
        "mode",
        "startedAt",
        "sessionSiteUsage",
        "blockedSites",
        "restrictedSites",
      ])) as StorageData;

      const currentTime = Date.now();
      const cutoff = currentTime - THIRTY_DAYS_MS;
      const rawSessions = stored.sessions ?? [];

      // Enforce 30-day retention: filter sessions
      const validSessions = rawSessions.filter((s) => s.startedAt >= cutoff);

      // If older sessions were found, prune them from persistent storage
      if (validSessions.length !== rawSessions.length) {
        await browser.storage.local.set({ sessions: validSessions });
      }

      setData({
        ...stored,
        sessions: validSessions,
      });
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    }
  };

  useEffect(() => {
    void loadData();

    const onStorageChange = (changes: Record<string, any>, areaName: string) => {
      if (areaName === "local") {
        void loadData();
      }
    };
    browser.storage.onChanged.addListener(onStorageChange);

    return () => {
      browser.storage.onChanged.removeListener(onStorageChange);
    };
  }, []);

  // 1-second interval to update live session clock
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleClearHistory = async () => {
    try {
      await browser.storage.local.set({ sessions: [] });
      setShowClearConfirm(false);
      void loadData();
    } catch (err) {
      console.error("Failed to clear sessions:", err);
    }
  };

  const handleToggleSession = async () => {
    if (data.isActive) {
      await browser.runtime.sendMessage({ message: "stop_session", mode: data.mode });
    } else {
      await browser.runtime.sendMessage({
        message: "start_session",
        mode: data.mode || "restrict",
      });
    }
    void loadData();
  };

  // --- TIME HELPERS ---
  const formatDuration = (ms: number): string => {
    if (ms <= 0) return "0s";
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const formatShortDuration = (ms: number): string => {
    if (ms <= 0) return "0m";
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${totalSec}s`;
  };

  const formatTimerDigits = (ms: number): string => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const formatDate = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // --- 30-DAY ANALYTICS COMPUTATIONS ---
  const sessions = data.sessions ?? [];

  // Completed & Live Durations
  const completedDurationMs = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
  const liveDurationMs =
    data.isActive && data.startedAt ? Math.max(0, now - data.startedAt) : 0;
  const totalFocusDurationMs = completedDurationMs + liveDurationMs;

  // 1. Separate Space for Last Session
  const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  const lastSessionDistractionMs = lastSession
    ? Object.values(lastSession.siteUsage ?? {}).reduce((acc, v) => acc + v, 0)
    : 0;
  const lastSessionIsClean = lastSession && lastSessionDistractionMs === 0;
  const lastSessionEfficiency =
    lastSession && lastSession.duration > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((lastSession.duration - lastSessionDistractionMs) /
                lastSession.duration) *
                100,
            ),
          ),
        )
      : 100;

  // 2. Longest Session Without Distraction
  const cleanSessions = sessions.filter((s) => {
    const dist = Object.values(s.siteUsage ?? {}).reduce((a, b) => a + b, 0);
    return dist === 0 && s.duration > 0;
  });
  const longestCleanSession =
    cleanSessions.length > 0
      ? cleanSessions.reduce((max, s) => (s.duration > max.duration ? s : max))
      : null;

  // 3. Analytics for All Restricted Apps (Last 30 Days)
  const restrictedAppsStats: Record<
    string,
    { totalDuration: number; sessionCount: number }
  > = {};

  for (const s of sessions) {
    if (s.siteUsage) {
      for (const [domain, duration] of Object.entries(s.siteUsage)) {
        if (!restrictedAppsStats[domain]) {
          restrictedAppsStats[domain] = { totalDuration: 0, sessionCount: 0 };
        }
        restrictedAppsStats[domain].totalDuration += duration;
        restrictedAppsStats[domain].sessionCount += 1;
      }
    }
  }

  // Add live session usage if active
  if (data.isActive && data.sessionSiteUsage) {
    for (const [domain, duration] of Object.entries(data.sessionSiteUsage)) {
      if (!restrictedAppsStats[domain]) {
        restrictedAppsStats[domain] = { totalDuration: 0, sessionCount: 1 };
      } else {
        restrictedAppsStats[domain].totalDuration += duration;
      }
    }
  }

  const totalDistractionMs = Object.values(restrictedAppsStats).reduce(
    (acc, val) => acc + val.totalDuration,
    0,
  );

  // Overall Focus Efficiency Score
  let overallEfficiency = 100;
  if (totalFocusDurationMs > 0) {
    const ratio = Math.max(0, 1 - totalDistractionMs / totalFocusDurationMs);
    overallEfficiency = Math.round(ratio * 100);
  }

  // Sorted list of restricted sites
  const sortedRestrictedSites = Object.entries(restrictedAppsStats).sort(
    (a, b) => b[1].totalDuration - a[1].totalDuration,
  );

  // 4. Most Distracting Website
  const topDistractingApp =
    sortedRestrictedSites.length > 0 ? sortedRestrictedSites[0] : null;

  // 5. Daily Bar Graph Data (Past 14 Days)
  const dailyBarData: DailyBarData[] = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let maxDailyFocusMinutes = 1;

  for (let i = 13; i >= 0; i--) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - i);
    targetDate.setHours(0, 0, 0, 0);

    const nextDate = new Date(targetDate);
    nextDate.setDate(targetDate.getDate() + 1);

    const startTs = targetDate.getTime();
    const endTs = nextDate.getTime();

    // Sum focus and distraction for this day
    const daySessions = sessions.filter(
      (s) => s.startedAt >= startTs && s.startedAt < endTs,
    );
    let dayFocusMs = daySessions.reduce((acc, s) => acc + (s.duration || 0), 0);
    let dayDistractionMs = daySessions.reduce((acc, s) => {
      const dist = Object.values(s.siteUsage ?? {}).reduce((a, b) => a + b, 0);
      return acc + dist;
    }, 0);

    // If today is active, include live focus time
    if (i === 0 && data.isActive && data.startedAt) {
      dayFocusMs += liveDurationMs;
    }

    const focusMinutes = Math.round(dayFocusMs / 60000);
    const distractionMinutes = Math.round(dayDistractionMs / 60000);

    if (focusMinutes > maxDailyFocusMinutes) {
      maxDailyFocusMinutes = focusMinutes;
    }

    dailyBarData.push({
      dateStr: `${targetDate.getMonth() + 1}/${targetDate.getDate()}`,
      dayLabel: dayNames[targetDate.getDay()] ?? "",
      focusMinutes,
      distractionMinutes,
      isToday: i === 0,
    });
  }

  // Filtered session list for table
  const filteredSessions = [...sessions]
    .reverse()
    .filter((s) => (filterMode === "all" ? true : s.mode === filterMode));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-600/30">
      {/* Top Navbar */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/60 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center font-bold text-zinc-100 shadow-sm">
              N
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white">Nudge</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                  Analytics
                </span>
                <span className="text-[11px] font-medium text-zinc-400 bg-zinc-850 px-2 py-0.5 rounded-full border border-zinc-800">
                  Last 30 Days
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {data.isActive ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Active ({formatTimerDigits(liveDurationMs)})</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-zinc-600"></span>
                <span>Idle</span>
              </div>
            )}

            <button
              onClick={handleToggleSession}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-sm ${
                data.isActive
                  ? "bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-500/30"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/30"
              }`}
            >
              {data.isActive ? "Stop Focus" : "Start Focus"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-6 py-8 flex-1 w-full space-y-8">
        {/* Live Active Session Banner */}
        {data.isActive && (
          <div className="rounded-2xl bg-zinc-900/80 border border-indigo-500/40 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <h2 className="text-xs font-semibold tracking-wide uppercase text-indigo-300">
                  Live Session in Progress
                </h2>
              </div>
              <p className="text-zinc-400 text-xs">
                Mode: <strong className="text-white capitalize">{data.mode}</strong> • Monitoring focus & active restrictions
              </p>
            </div>

            <div className="text-right">
              <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold block">
                Current Sprint
              </span>
              <span className="text-3xl font-bold font-mono text-white tracking-tight">
                {formatTimerDigits(liveDurationMs)}
              </span>
            </div>
          </div>
        )}

        {/* SECTION 1: DEDICATED SPACE FOR LAST SESSION */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <span>⏱️</span>
              <span>Last Completed Session</span>
            </h3>
            {lastSession && (
              <span className="text-xs text-zinc-500">
                Completed {formatDate(lastSession.endedAt)}
              </span>
            )}
          </div>

          {lastSession ? (
            <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-xl font-mono font-bold text-white">
                    {lastSession.mode === "block" ? "🔒" : "⏱️"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg text-white">
                        {formatDuration(lastSession.duration)}
                      </span>
                      <span
                        className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md ${
                          lastSession.mode === "block"
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        }`}
                      >
                        {lastSession.mode} mode
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {formatDate(lastSession.startedAt)} → {formatDate(lastSession.endedAt)}
                    </p>
                  </div>
                </div>

                {/* Last Session Efficiency Badge */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold block">
                      Session Efficiency
                    </span>
                    <span className="text-xl font-bold font-mono text-white">
                      {lastSessionEfficiency}%
                    </span>
                  </div>
                  <div
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                      lastSessionIsClean
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : lastSessionEfficiency >= 75
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    }`}
                  >
                    {lastSessionIsClean
                      ? "Clean Focus 🌟"
                      : lastSessionEfficiency >= 75
                      ? "Minor Distraction"
                      : "Interrupted"}
                  </div>
                </div>
              </div>

              {/* Distraction breakdown for last session */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-zinc-400 block">
                  Distractions During Last Session:
                </span>
                {lastSessionIsClean ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-xl">
                    <span>✨</span>
                    <span>No restricted websites visited! Perfect focus sprint logged.</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(lastSession.siteUsage ?? {}).map(([dom, dur]) => (
                      <span
                        key={dom}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-800 text-zinc-200 text-xs border border-zinc-700/60"
                      >
                        <span className="font-semibold">{dom}:</span>
                        <span className="font-mono text-amber-400">{formatDuration(dur)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-8 text-center space-y-2">
              <span className="text-2xl">⏳</span>
              <p className="text-sm font-semibold text-zinc-300">No sessions completed yet</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Once you finish your first focus sprint by clicking "Start Focus" and "Stop Focus", your last session breakdown will appear here.
              </p>
            </div>
          )}
        </section>

        {/* SECTION 2: 30-DAY KEY METRICS (Longest Clean Session & Most Distracting App) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Longest Clean Session */}
          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-5 space-y-2 hover:border-zinc-700/60 transition-colors">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Longest Clean Session
              </span>
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm">
                🏆
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-white tracking-tight">
              {longestCleanSession ? formatDuration(longestCleanSession.duration) : "0s"}
            </div>
            <p className="text-xs text-zinc-500">
              {longestCleanSession ? (
                <>
                  Achieved on {formatDate(longestCleanSession.startedAt)} • Zero distractions
                </>
              ) : (
                "Finish a session with 0 distractions to set your record"
              )}
            </p>
          </div>

          {/* Card 2: Most Distracting Website */}
          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-5 space-y-2 hover:border-zinc-700/60 transition-colors">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Top Distraction
              </span>
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-sm">
                ⚠️
              </span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight truncate">
              {topDistractingApp ? topDistractingApp[0] : "None"}
            </div>
            <p className="text-xs text-zinc-500">
              {topDistractingApp ? (
                <>
                  <span className="font-mono text-amber-400">
                    {formatShortDuration(topDistractingApp[1].totalDuration)}
                  </span>{" "}
                  wasted across {topDistractingApp[1].sessionCount} session
                  {topDistractingApp[1].sessionCount === 1 ? "" : "s"}
                </>
              ) : (
                "No distraction visits logged"
              )}
            </p>
          </div>

          {/* Card 3: Total 30-Day Focus Time */}
          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-5 space-y-2 hover:border-zinc-700/60 transition-colors">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Total Focus (30d)
              </span>
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 text-sm">
                ⏱️
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-white tracking-tight">
              {formatDuration(totalFocusDurationMs)}
            </div>
            <p className="text-xs text-zinc-500">
              Across {sessions.length} session{sessions.length === 1 ? "" : "s"}
            </p>
          </div>

          {/* Card 4: Overall Focus Efficiency */}
          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-5 space-y-2 hover:border-zinc-700/60 transition-colors">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Efficiency (30d)
              </span>
              <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 text-sm">
                🎯
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white tracking-tight">
                {overallEfficiency}%
              </span>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  overallEfficiency >= 85
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : overallEfficiency >= 60
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                }`}
              >
                {overallEfficiency >= 85
                  ? "Optimal"
                  : overallEfficiency >= 60
                  ? "Moderate"
                  : "Distracted"}
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              {formatShortDuration(totalDistractionMs)} total distraction
            </p>
          </div>
        </section>

        {/* SECTION 3: BAR GRAPH - DAILY ACTIVITY (14 DAYS) */}
        <section className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <span>📊</span>
                <span>Daily Focus & Distraction Activity</span>
              </h3>
              <p className="text-xs text-zinc-400">
                Focus time vs. restricted app distractions over the last 14 days
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-indigo-500"></span>
                <span className="text-zinc-300">Focus Time</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-500"></span>
                <span className="text-zinc-300">Distraction Time</span>
              </div>
            </div>
          </div>

          {/* Bar Chart Container */}
          <div className="pt-4 pb-2">
            <div className="flex items-end justify-between gap-2 h-44 border-b border-zinc-800 pb-2 px-1">
              {dailyBarData.map((day, idx) => {
                const focusHeightPct = Math.max(
                  4,
                  Math.round((day.focusMinutes / maxDailyFocusMinutes) * 100),
                );
                const distractionHeightPct = Math.max(
                  4,
                  Math.round((day.distractionMinutes / maxDailyFocusMinutes) * 100),
                );

                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center h-full justify-end group relative"
                  >
                    {/* Tooltip on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-20 pointer-events-none bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] rounded-lg px-2 py-1 shadow-lg whitespace-nowrap">
                      <div className="font-semibold text-white">{day.dayLabel} ({day.dateStr})</div>
                      <div>Focus: {day.focusMinutes}m</div>
                      {day.distractionMinutes > 0 && (
                        <div className="text-amber-400">Distracted: {day.distractionMinutes}m</div>
                      )}
                    </div>

                    {/* Bars pair */}
                    <div className="w-full flex items-end justify-center gap-1 h-full">
                      {/* Focus bar */}
                      <div
                        style={{ height: `${day.focusMinutes > 0 ? focusHeightPct : 4}%` }}
                        className={`w-1/2 rounded-t-sm transition-all duration-300 ${
                          day.focusMinutes > 0
                            ? day.isToday
                              ? "bg-indigo-500 group-hover:bg-indigo-400"
                              : "bg-indigo-600/80 group-hover:bg-indigo-500"
                            : "bg-zinc-800/40"
                        }`}
                      />
                      {/* Distraction bar */}
                      <div
                        style={{
                          height: `${day.distractionMinutes > 0 ? distractionHeightPct : 4}%`,
                        }}
                        className={`w-1/2 rounded-t-sm transition-all duration-300 ${
                          day.distractionMinutes > 0
                            ? "bg-amber-500 group-hover:bg-amber-400"
                            : "bg-zinc-800/40"
                        }`}
                      />
                    </div>

                    {/* Day Label */}
                    <div className="mt-2 text-center">
                      <span
                        className={`text-[10px] font-mono block leading-none ${
                          day.isToday ? "text-indigo-400 font-bold" : "text-zinc-500"
                        }`}
                      >
                        {day.dayLabel}
                      </span>
                      <span className="text-[9px] text-zinc-600 font-mono block mt-0.5">
                        {day.dateStr}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 4: RESTRICTED APPS 30-DAY ANALYTICS & BREAKDOWN */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Restricted Apps Usage (Horizontal Bar Chart) */}
          <div className="lg:col-span-2 rounded-2xl bg-zinc-900/60 border border-zinc-800 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <span>📱</span>
                  <span>Restricted Apps Analytics (Last 30 Days)</span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Total time spent on distraction-prone websites during focus mode
                </p>
              </div>
              <span className="text-xs text-zinc-500 font-medium">
                {sortedRestrictedSites.length} domain{sortedRestrictedSites.length === 1 ? "" : "s"} tracked
              </span>
            </div>

            {sortedRestrictedSites.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-zinc-800 mx-auto flex items-center justify-center text-xl">
                  ✨
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-300">
                    No restricted app usage in the last 30 days!
                  </p>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    When you access restricted sites like YouTube or Instagram during focus sessions, their duration and visit frequency will be tracked here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedRestrictedSites.map(([domain, stats]) => {
                  const pct =
                    totalDistractionMs > 0
                      ? Math.min(
                          100,
                          Math.round((stats.totalDuration / totalDistractionMs) * 100),
                        )
                      : 0;

                  return (
                    <div key={domain} className="space-y-2 p-3 rounded-xl bg-zinc-850/30 border border-zinc-800/60">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-200 font-bold flex items-center justify-center text-xs">
                            {domain.charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <span className="font-semibold text-zinc-100 text-sm block">
                              {domain}
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              Logged in {stats.sessionCount} focus session
                              {stats.sessionCount === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-mono text-sm font-bold text-white block">
                            {formatDuration(stats.totalDuration)}
                          </span>
                          <span className="text-xs text-amber-400 font-medium">
                            {pct}% of all distractions
                          </span>
                        </div>
                      </div>

                      {/* Bar indicator */}
                      <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Protected Domains & Retention Policy */}
          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-6 space-y-6">
            <div>
              <h3 className="font-bold text-base text-white">Focus Rules & Retention</h3>
              <p className="text-xs text-zinc-400">
                Extension policies & tracked domains
              </p>
            </div>

            <div className="space-y-4">
              {/* Retention notice */}
              <div className="p-3.5 rounded-xl bg-zinc-850/60 border border-zinc-800 text-xs text-zinc-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <span>📅</span>
                  <span>30-Day Storage Policy</span>
                </div>
                <p className="text-zinc-400">
                  Data is automatically pruned so only sessions from the last 30 days are retained, keeping your extension lightweight and fast.
                </p>
              </div>

              {/* Restricted Sites */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    Restricted Sites
                  </span>
                  <span className="text-[11px] text-zinc-500 font-normal">Shows banner & timers</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(data.restrictedSites ?? ["youtube.com", "instagram.com"]).map((site) => (
                    <span
                      key={site}
                      className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700/60 font-mono"
                    >
                      {site}
                    </span>
                  ))}
                </div>
              </div>

              {/* Blocked Sites */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                    Hard Blocked Sites
                  </span>
                  <span className="text-[11px] text-zinc-500 font-normal">Full lockout screen</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(data.blockedSites ?? ["twitter.com"]).map((site) => (
                    <span
                      key={site}
                      className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700/60 font-mono"
                    >
                      {site}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: 30-DAY SESSION HISTORY TABLE */}
        <section className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-white">30-Day Session History</h3>
              <p className="text-xs text-zinc-400">
                Detailed timeline of focus sprints recorded in the last 30 days
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Filter Tabs */}
              <div className="flex rounded-xl bg-zinc-850 p-1 border border-zinc-800 text-xs">
                {(["all", "restrict", "block"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setFilterMode(mode)}
                    className={`px-3 py-1 rounded-lg capitalize font-medium transition-all cursor-pointer ${
                      filterMode === mode
                        ? "bg-zinc-700 text-white shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {sessions.length > 0 && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                >
                  Clear History
                </button>
              )}
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="py-14 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 mx-auto flex items-center justify-center text-xl">
                📜
              </div>
              <p className="text-sm font-semibold text-zinc-300">No session history found</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Completed focus sessions will be automatically stored and listed here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Distractions Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredSessions.map((session, idx) => {
                    const sessionDistractionEntries = Object.entries(session.siteUsage || {});

                    return (
                      <tr key={idx} className="hover:bg-zinc-850/40 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-zinc-200">
                          {formatDate(session.startedAt)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md font-medium text-[11px] capitalize ${
                              session.mode === "block"
                                ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                                : "bg-purple-500/10 text-purple-300 border border-purple-500/20"
                            }`}
                          >
                            {session.mode}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-zinc-200">
                          {formatDuration(session.duration)}
                        </td>
                        <td className="py-3.5 px-4">
                          {sessionDistractionEntries.length === 0 ? (
                            <span className="text-emerald-400 font-medium">Clean Focus 🌟</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {sessionDistractionEntries.map(([dom, dur]) => (
                                <span
                                  key={dom}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[11px]"
                                >
                                  <strong>{dom}:</strong> {formatDuration(dur)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h4 className="font-bold text-white text-base">Clear 30-Day History?</h4>
            <p className="text-xs text-zinc-400">
              Are you sure you want to delete all recorded focus sessions? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-zinc-800 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearHistory}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer transition-colors shadow-sm"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-800/60 py-6 text-center text-xs text-zinc-500">
        Nudge Focus Extension • 30-Day Productivity Analytics
      </footer>
    </div>
  );
}
