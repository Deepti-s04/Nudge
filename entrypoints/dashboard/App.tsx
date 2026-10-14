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

// --- ELEGANT MINIMALIST SVG ICONS (CHIC & CRISP) ---
function IconShield({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconClock({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconTrophy({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
      <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function IconAlertTriangle({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconTarget({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconBarChart({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

function IconSun({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function IconMoon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function IconTrash({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconCheckCircle({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export default function App() {
  const [data, setData] = useState<StorageData>({
    sessions: [],
    isActive: false,
    mode: "block",
    startedAt: 0,
    sessionSiteUsage: {},
    blockedSites: ["x.com", "twitter.com"],
    restrictedSites: ["youtube.com", "instagram.com"],
  });

  const [filterMode, setFilterMode] = useState<"all" | "block" | "restrict">("all");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Theme state: "dark" | "light"
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nudge_dashboard_theme");
      if (saved === "dark" || saved === "light") return saved;
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
        return "light";
      }
    }
    return "dark";
  });

  // Mode Selection State for Starting Sessions
  const [selectedMode, setSelectedMode] = useState<"block" | "restrict">("block");

  // Sync theme with body and html
  useEffect(() => {
    localStorage.setItem("nudge_dashboard_theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.body.style.backgroundColor = "#09090b";
      document.body.style.color = "#f4f4f5";
    } else {
      document.documentElement.classList.remove("dark");
      document.body.style.backgroundColor = "#f8f9fa";
      document.body.style.color = "#09090b";
    }
  }, [theme]);

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

      // Enforce 30-day retention
      const validSessions = rawSessions.filter((s) => s.startedAt >= cutoff);

      if (validSessions.length !== rawSessions.length) {
        await browser.storage.local.set({ sessions: validSessions });
      }

      setData({
        ...stored,
        sessions: validSessions,
      });

      if (stored.mode === "block" || stored.mode === "restrict") {
        setSelectedMode(stored.mode);
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    }
  };

  useEffect(() => {
    void loadData();

    const onStorageChange = (changes: Record<string, any>, areaName: string) => {
      if (areaName === "local") {
        if (
          changes.isActive !== undefined ||
          changes.mode !== undefined ||
          changes.startedAt !== undefined ||
          changes.blockedSites !== undefined ||
          changes.restrictedSites !== undefined ||
          changes.sessions !== undefined ||
          changes.sessionSiteUsage !== undefined
        ) {
          void loadData();
        }
      }
    };
    browser.storage.onChanged.addListener(onStorageChange);

    return () => {
      browser.storage.onChanged.removeListener(onStorageChange);
    };
  }, []);

  // 1-second interval to update live clock
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSelectMode = async (mode: "block" | "restrict") => {
    setSelectedMode(mode);
    try {
      await browser.storage.local.set({ mode });
    } catch (err) {
      console.error("Failed to persist mode:", err);
    }
  };

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
        mode: selectedMode,
      });
    }
    void loadData();
  };

  // --- TIME FORMATTERS ---
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

  // --- 30-DAY COMPUTATIONS ---
  const sessions = data.sessions ?? [];

  const completedDurationMs = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
  const liveDurationMs =
    data.isActive && data.startedAt ? Math.max(0, now - data.startedAt) : 0;
  const totalFocusDurationMs = completedDurationMs + liveDurationMs;

  // 1. Last session
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

  // 2. Longest clean session
  const cleanSessions = sessions.filter((s) => {
    const dist = Object.values(s.siteUsage ?? {}).reduce((a, b) => a + b, 0);
    return dist === 0 && s.duration > 0;
  });
  const longestCleanSession =
    cleanSessions.length > 0
      ? cleanSessions.reduce((max, s) => (s.duration > max.duration ? s : max))
      : null;

  // 3. Analytics for restricted apps
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

  let overallEfficiency = 100;
  if (totalFocusDurationMs > 0) {
    const ratio = Math.max(0, 1 - totalDistractionMs / totalFocusDurationMs);
    overallEfficiency = Math.round(ratio * 100);
  }

  const sortedRestrictedSites = Object.entries(restrictedAppsStats).sort(
    (a, b) => b[1].totalDuration - a[1].totalDuration,
  );

  const topDistractingApp =
    sortedRestrictedSites.length > 0 ? sortedRestrictedSites[0] : null;

  // 4. Daily Bar Graph Data (Past 14 Days)
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

    const daySessions = sessions.filter(
      (s) => s.startedAt >= startTs && s.startedAt < endTs,
    );

    let dayFocusMs = daySessions.reduce((acc, s) => acc + (s.duration || 0), 0);
    let dayDistractionMs = 0;

    for (const s of daySessions) {
      if (s.siteUsage) {
        dayDistractionMs += Object.values(s.siteUsage).reduce((a, b) => a + b, 0);
      }
    }

    if (i === 0 && data.isActive && data.startedAt) {
      dayFocusMs += Math.max(0, now - data.startedAt);
      if (data.sessionSiteUsage) {
        dayDistractionMs += Object.values(data.sessionSiteUsage).reduce(
          (a, b) => a + b,
          0,
        );
      }
    }

    const focusMinutes = Math.round(dayFocusMs / 60000);
    const distractionMinutes = Math.round(dayDistractionMs / 60000);

    if (focusMinutes > maxDailyFocusMinutes) maxDailyFocusMinutes = focusMinutes;
    if (distractionMinutes > maxDailyFocusMinutes) maxDailyFocusMinutes = distractionMinutes;

    dailyBarData.push({
      dateStr: `${targetDate.getMonth() + 1}/${targetDate.getDate()}`,
      dayLabel: dayNames[targetDate.getDay()] ?? "",
      focusMinutes,
      distractionMinutes,
      isToday: i === 0,
    });
  }

  // 5. Filtered sessions
  const filteredSessions = sessions.filter((s) => {
    if (filterMode === "all") return true;
    return s.mode === filterMode;
  });

  const isDark = theme === "dark";

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 select-none ${
        isDark ? "bg-[#09090b] text-[#f4f4f5]" : "bg-[#f8f9fa] text-[#09090b]"
      }`}
    >
      {/* HEADER */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors ${
          isDark
            ? "bg-[#09090b]/80 border-neutral-800"
            : "bg-white/80 border-neutral-200"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm tracking-tight border transition-colors ${
                isDark
                  ? "bg-neutral-900 border-neutral-800 text-neutral-100 shadow-sm"
                  : "bg-neutral-100 border-neutral-200 text-neutral-900 shadow-sm"
              }`}
            >
              N
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight">Nudge</span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    isDark
                      ? "bg-neutral-900 text-neutral-300 border-neutral-800"
                      : "bg-neutral-100 text-neutral-600 border-neutral-200"
                  }`}
                >
                  Focus Analytics
                </span>
                <span
                  className={`hidden sm:inline text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    isDark
                      ? "bg-neutral-950 text-neutral-500 border-neutral-850"
                      : "bg-neutral-50 text-neutral-400 border-neutral-200"
                  }`}
                >
                  Last 30 Days
                </span>
              </div>
            </div>
          </div>

          {/* Controls: Mode Selector, Start/Stop Button, Theme Toggle */}
          <div className="flex items-center gap-2.5">
            {/* Live Indicator (When Active) */}
            {data.isActive && (
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium font-mono ${
                  isDark
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700"
                }`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Active ({formatTimerDigits(liveDurationMs)})</span>
              </div>
            )}

            {/* Mode Selector (When Idle) */}
            {!data.isActive && (
              <div
                className={`flex items-center p-0.5 rounded-xl border text-xs ${
                  isDark ? "bg-neutral-900 border-neutral-800" : "bg-neutral-100 border-neutral-200"
                }`}
              >
                <button
                  onClick={() => handleSelectMode("block")}
                  title="Hard lockout screen on blocked sites"
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    selectedMode === "block"
                      ? isDark
                        ? "bg-neutral-800 text-white shadow-sm border border-neutral-700"
                        : "bg-white text-neutral-900 shadow-sm border border-neutral-300"
                      : isDark
                        ? "text-neutral-400 hover:text-neutral-200"
                        : "text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  <IconShield className="w-3.5 h-3.5" />
                  <span>Block</span>
                </button>

                <button
                  onClick={() => handleSelectMode("restrict")}
                  title="Soft warning bar & distraction timers"
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    selectedMode === "restrict"
                      ? isDark
                        ? "bg-neutral-800 text-white shadow-sm border border-neutral-700"
                        : "bg-white text-neutral-900 shadow-sm border border-neutral-300"
                      : isDark
                        ? "text-neutral-400 hover:text-neutral-200"
                        : "text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  <IconClock className="w-3.5 h-3.5" />
                  <span>Restrict</span>
                </button>
              </div>
            )}

            {/* Primary Action Button (Start / Stop) */}
            <button
              onClick={handleToggleSession}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm ${
                data.isActive
                  ? isDark
                    ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30"
                    : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
                  : isDark
                    ? "bg-white hover:bg-neutral-200 text-neutral-950 border border-white"
                    : "bg-neutral-950 hover:bg-neutral-800 text-white border border-neutral-950"
              }`}
            >
              {data.isActive ? "Stop Focus" : `Start Focus (${selectedMode.toUpperCase()})`}
            </button>

            {/* Dark / Light Mode Switcher */}
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                isDark
                  ? "bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800"
                  : "bg-white border-neutral-200 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-50"
              }`}
            >
              {isDark ? <IconSun className="w-4 h-4" /> : <IconMoon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-6xl mx-auto px-6 py-8 flex-1 w-full space-y-8">
        {/* ACTIVE SESSION HERO CARD */}
        {data.isActive && (
          <div
            className={`rounded-2xl border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm transition-colors ${
              isDark
                ? "bg-neutral-900/70 border-emerald-500/30"
                : "bg-white border-emerald-200 shadow-emerald-50/50"
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <h2
                  className={`text-xs font-bold uppercase tracking-wider ${
                    isDark ? "text-emerald-400" : "text-emerald-700"
                  }`}
                >
                  Live Session in Progress
                </h2>
              </div>
              <p className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
                Mode:{" "}
                <strong
                  className={`font-semibold capitalize ${
                    isDark ? "text-white" : "text-neutral-900"
                  }`}
                >
                  {data.mode}
                </strong>{" "}
                • {data.mode === "block" ? "Hard Lockout Active on Blocked Sites" : "Real-time Distraction Timers Active"}
              </p>
            </div>

            <div className="text-right">
              <span
                className={`text-[10px] uppercase tracking-wider font-semibold block ${
                  isDark ? "text-neutral-500" : "text-neutral-400"
                }`}
              >
                Current Sprint
              </span>
              <span
                className={`text-3xl font-bold font-mono tracking-tight ${
                  isDark ? "text-white" : "text-neutral-950"
                }`}
              >
                {formatTimerDigits(liveDurationMs)}
              </span>
            </div>
          </div>
        )}

        {/* IDLE MODE LAUNCHPAD (Gives clear, chic options to pick mode and start) */}
        {!data.isActive && (
          <div
            className={`rounded-2xl border p-6 transition-colors ${
              isDark
                ? "bg-neutral-900/40 border-neutral-800"
                : "bg-white border-neutral-200 shadow-sm"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                  <IconTarget className="w-4 h-4 text-emerald-500" />
                  <span>Choose Your Focus Mode</span>
                </h2>
                <p className={`text-xs mt-0.5 ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
                  Select how you want Nudge to safeguard your attention before starting your sprint
                </p>
              </div>

              <button
                onClick={handleToggleSession}
                className={`px-5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm ${
                  isDark
                    ? "bg-white hover:bg-neutral-200 text-neutral-950"
                    : "bg-neutral-950 hover:bg-neutral-800 text-white"
                }`}
              >
                Start {selectedMode === "block" ? "Block" : "Restrict"} Sprint →
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Option 1: Block Mode */}
              <div
                onClick={() => handleSelectMode("block")}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedMode === "block"
                    ? isDark
                      ? "bg-neutral-850/80 border-neutral-600 ring-1 ring-neutral-500/30"
                      : "bg-neutral-50/80 border-neutral-900 ring-1 ring-neutral-900/10"
                    : isDark
                      ? "bg-neutral-900/20 border-neutral-800 hover:border-neutral-700"
                      : "bg-white border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        selectedMode === "block"
                          ? isDark
                            ? "bg-rose-500/15 text-rose-400"
                            : "bg-rose-100 text-rose-700"
                          : isDark
                            ? "bg-neutral-800 text-neutral-400"
                            : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      <IconShield className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm">Block Mode</span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      selectedMode === "block"
                        ? isDark
                          ? "bg-rose-500/10 text-rose-300 border-rose-500/20"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                        : isDark
                          ? "bg-neutral-800 text-neutral-500 border-neutral-750"
                          : "bg-neutral-100 text-neutral-400 border-neutral-200"
                    }`}
                  >
                    Hard Lockout
                  </span>
                </div>
                <p className={`text-xs leading-relaxed ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
                  Completely blocks access to distracting websites (e.g. Twitter). Renders a calm, motivating full-screen focus reminder to keep you in the zone.
                </p>
              </div>

              {/* Option 2: Restrict Mode */}
              <div
                onClick={() => handleSelectMode("restrict")}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedMode === "restrict"
                    ? isDark
                      ? "bg-neutral-850/80 border-neutral-600 ring-1 ring-neutral-500/30"
                      : "bg-neutral-50/80 border-neutral-900 ring-1 ring-neutral-900/10"
                    : isDark
                      ? "bg-neutral-900/20 border-neutral-800 hover:border-neutral-700"
                      : "bg-white border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        selectedMode === "restrict"
                          ? isDark
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-amber-100 text-amber-700"
                          : isDark
                            ? "bg-neutral-800 text-neutral-400"
                            : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      <IconClock className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm">Restrict Mode</span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      selectedMode === "restrict"
                        ? isDark
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                        : isDark
                          ? "bg-neutral-800 text-neutral-500 border-neutral-750"
                          : "bg-neutral-100 text-neutral-400 border-neutral-200"
                    }`}
                  >
                    Soft Nudge
                  </span>
                </div>
                <p className={`text-xs leading-relaxed ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
                  Allows access to study tools or secondary sites (e.g. YouTube, Instagram) while showing active distraction countdowns and tracking every second spent.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 1: LAST COMPLETED SESSION */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3
              className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                isDark ? "text-neutral-400" : "text-neutral-500"
              }`}
            >
              <IconClock className="w-3.5 h-3.5" />
              <span>Last Completed Session</span>
            </h3>
            {lastSession && (
              <span className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                Finished {formatDate(lastSession.endedAt)}
              </span>
            )}
          </div>

          {lastSession ? (
            <div
              className={`rounded-2xl border p-6 space-y-4 transition-colors ${
                isDark
                  ? "bg-neutral-900/50 border-neutral-800"
                  : "bg-white border-neutral-200 shadow-sm"
              }`}
            >
              <div
                className={`flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 ${
                  isDark ? "border-neutral-800" : "border-neutral-100"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg border ${
                      isDark
                        ? "bg-neutral-850 border-neutral-750 text-neutral-100"
                        : "bg-neutral-100 border-neutral-200 text-neutral-900"
                    }`}
                  >
                    {lastSession.mode === "block" ? (
                      <IconShield className="w-5 h-5 text-rose-500" />
                    ) : (
                      <IconClock className="w-5 h-5 text-amber-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">
                        {formatDuration(lastSession.duration)}
                      </span>
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${
                          lastSession.mode === "block"
                            ? isDark
                              ? "bg-rose-500/10 text-rose-300 border-rose-500/20"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                            : isDark
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {lastSession.mode} mode
                      </span>
                    </div>
                    <p className={`text-xs mt-0.5 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                      {formatDate(lastSession.startedAt)} → {formatDate(lastSession.endedAt)}
                    </p>
                  </div>
                </div>

                {/* Efficiency Badge */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold block ${
                        isDark ? "text-neutral-500" : "text-neutral-400"
                      }`}
                    >
                      Session Efficiency
                    </span>
                    <span className="text-xl font-bold font-mono">
                      {lastSessionEfficiency}%
                    </span>
                  </div>
                  <div
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                      lastSessionIsClean
                        ? isDark
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : lastSessionEfficiency >= 75
                          ? isDark
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                          : isDark
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {lastSessionIsClean
                      ? "Clean Sprint ✨"
                      : lastSessionEfficiency >= 75
                        ? "Minor Distraction"
                        : "Interrupted"}
                  </div>
                </div>
              </div>

              {/* Distractions breakdown for last session */}
              <div className="space-y-2">
                <span className={`text-xs font-medium block ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                  Distractions During Last Session:
                </span>
                {lastSessionIsClean ? (
                  <div
                    className={`flex items-center gap-2 text-xs p-3 rounded-xl border ${
                      isDark
                        ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/20"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    <IconCheckCircle className="w-4 h-4 shrink-0" />
                    <span>Zero distracting websites accessed! Perfect sprint recorded.</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(lastSession.siteUsage ?? {}).map(([dom, dur]) => (
                      <span
                        key={dom}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs border ${
                          isDark
                            ? "bg-neutral-800 text-neutral-200 border-neutral-700"
                            : "bg-neutral-100 text-neutral-800 border-neutral-200"
                        }`}
                      >
                        <span className="font-semibold">{dom}:</span>
                        <span className="font-mono text-amber-500 dark:text-amber-400 font-bold">
                          {formatDuration(dur)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              className={`rounded-2xl border p-8 text-center space-y-2 transition-colors ${
                isDark
                  ? "bg-neutral-900/30 border-neutral-800"
                  : "bg-white border-neutral-200"
              }`}
            >
              <div className="w-10 h-10 rounded-full mx-auto flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                <IconClock className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold">No sessions completed yet</p>
              <p className={`text-xs max-w-sm mx-auto ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                Start a sprint above to log your first focus analytics.
              </p>
            </div>
          )}
        </section>

        {/* SECTION 2: 30-DAY KEY METRICS */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Longest Clean Session */}
          <div
            className={`rounded-2xl border p-5 space-y-2 transition-all ${
              isDark
                ? "bg-neutral-900/50 border-neutral-800 hover:border-neutral-700"
                : "bg-white border-neutral-200 hover:border-neutral-300 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isDark ? "text-neutral-400" : "text-neutral-500"
                }`}
              >
                Longest Clean Session
              </span>
              <div
                className={`p-1.5 rounded-lg ${
                  isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                }`}
              >
                <IconTrophy className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight">
              {longestCleanSession ? formatDuration(longestCleanSession.duration) : "0s"}
            </div>
            <p className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
              {longestCleanSession ? (
                <>Achieved on {formatDate(longestCleanSession.startedAt)}</>
              ) : (
                "Finish a session with 0 distractions"
              )}
            </p>
          </div>

          {/* Card 2: Top Distraction */}
          <div
            className={`rounded-2xl border p-5 space-y-2 transition-all ${
              isDark
                ? "bg-neutral-900/50 border-neutral-800 hover:border-neutral-700"
                : "bg-white border-neutral-200 hover:border-neutral-300 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isDark ? "text-neutral-400" : "text-neutral-500"
                }`}
              >
                Top Distraction
              </span>
              <div
                className={`p-1.5 rounded-lg ${
                  isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"
                }`}
              >
                <IconAlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight truncate">
              {topDistractingApp ? topDistractingApp[0] : "None"}
            </div>
            <p className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
              {topDistractingApp ? (
                <>
                  <span className="font-mono text-amber-500 font-semibold">
                    {formatShortDuration(topDistractingApp[1].totalDuration)}
                  </span>{" "}
                  across {topDistractingApp[1].sessionCount} session
                  {topDistractingApp[1].sessionCount === 1 ? "" : "s"}
                </>
              ) : (
                "No distraction visits logged"
              )}
            </p>
          </div>

          {/* Card 3: Total 30-Day Focus Time */}
          <div
            className={`rounded-2xl border p-5 space-y-2 transition-all ${
              isDark
                ? "bg-neutral-900/50 border-neutral-800 hover:border-neutral-700"
                : "bg-white border-neutral-200 hover:border-neutral-300 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isDark ? "text-neutral-400" : "text-neutral-500"
                }`}
              >
                Total Focus (30d)
              </span>
              <div
                className={`p-1.5 rounded-lg ${
                  isDark ? "bg-neutral-800 text-neutral-300" : "bg-neutral-100 text-neutral-700"
                }`}
              >
                <IconClock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight">
              {formatDuration(totalFocusDurationMs)}
            </div>
            <p className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
              Across {sessions.length} session{sessions.length === 1 ? "" : "s"}
            </p>
          </div>

          {/* Card 4: Overall Focus Efficiency */}
          <div
            className={`rounded-2xl border p-5 space-y-2 transition-all ${
              isDark
                ? "bg-neutral-900/50 border-neutral-800 hover:border-neutral-700"
                : "bg-white border-neutral-200 hover:border-neutral-300 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isDark ? "text-neutral-400" : "text-neutral-500"
                }`}
              >
                Efficiency (30d)
              </span>
              <div
                className={`p-1.5 rounded-lg ${
                  isDark ? "bg-neutral-800 text-neutral-300" : "bg-neutral-100 text-neutral-700"
                }`}
              >
                <IconTarget className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tracking-tight">
                {overallEfficiency}%
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  overallEfficiency >= 85
                    ? isDark
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : overallEfficiency >= 60
                      ? isDark
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                      : isDark
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                }`}
              >
                {overallEfficiency >= 85
                  ? "Optimal"
                  : overallEfficiency >= 60
                    ? "Moderate"
                    : "Distracted"}
              </span>
            </div>
            <p className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
              {totalDistractionMs === 0 ? "Zero distractions logged" : `${formatDuration(totalDistractionMs)} total distraction`}
            </p>
          </div>
        </section>

        {/* SECTION 3: DAILY FOCUS & DISTRACTION ACTIVITY (14 DAYS) */}
        <section
          className={`rounded-2xl border p-6 space-y-5 transition-colors ${
            isDark
              ? "bg-neutral-900/50 border-neutral-800"
              : "bg-white border-neutral-200 shadow-sm"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <IconBarChart className="w-4 h-4 text-neutral-400" />
                <span>Daily Focus & Distraction Activity</span>
              </h3>
              <p className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
                Focus time vs. restricted app distractions over the last 14 days
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-3 h-3 rounded ${
                    isDark ? "bg-neutral-200" : "bg-neutral-900"
                  }`}
                ></span>
                <span className={isDark ? "text-neutral-300" : "text-neutral-700"}>Focus Time</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-500"></span>
                <span className={isDark ? "text-neutral-300" : "text-neutral-700"}>Distraction</span>
              </div>
            </div>
          </div>

          {/* Bar Chart Container */}
          <div className="pt-4 pb-2">
            <div
              className={`flex items-end justify-between gap-2 h-44 border-b pb-2 px-1 ${
                isDark ? "border-neutral-800" : "border-neutral-200"
              }`}
            >
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
                    <div
                      className={`opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-20 pointer-events-none border text-[10px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap ${
                        isDark
                          ? "bg-neutral-900 border-neutral-700 text-neutral-200"
                          : "bg-white border-neutral-300 text-neutral-800"
                      }`}
                    >
                      <div className="font-semibold">{day.dayLabel} ({day.dateStr})</div>
                      <div>Focus: {day.focusMinutes}m</div>
                      {day.distractionMinutes > 0 && (
                        <div className="text-amber-500 font-medium">Distracted: {day.distractionMinutes}m</div>
                      )}
                    </div>

                    {/* Bars pair */}
                    <div className="w-full flex items-end justify-center gap-1 h-full">
                      {/* Focus bar */}
                      <div
                        style={{ height: `${day.focusMinutes > 0 ? focusHeightPct : 4}%` }}
                        className={`w-1/2 rounded-t-sm transition-all duration-300 ${
                          day.focusMinutes > 0
                            ? isDark
                              ? "bg-neutral-200 group-hover:bg-white"
                              : "bg-neutral-900 group-hover:bg-neutral-750"
                            : isDark
                              ? "bg-neutral-800/40"
                              : "bg-neutral-200/50"
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
                            : isDark
                              ? "bg-neutral-800/40"
                              : "bg-neutral-200/50"
                        }`}
                      />
                    </div>

                    {/* Day Label */}
                    <div className="mt-2 text-center">
                      <span
                        className={`text-[10px] font-mono block leading-none ${
                          day.isToday
                            ? isDark
                              ? "text-neutral-100 font-bold"
                              : "text-neutral-950 font-bold"
                            : isDark
                              ? "text-neutral-500"
                              : "text-neutral-400"
                        }`}
                      >
                        {day.dayLabel}
                      </span>
                      <span
                        className={`text-[9px] font-mono block mt-0.5 ${
                          isDark ? "text-neutral-600" : "text-neutral-400"
                        }`}
                      >
                        {day.dateStr}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 4: RESTRICTED APPS & RULES */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Restricted Apps Breakdown */}
          <div
            className={`lg:col-span-2 rounded-2xl border p-6 space-y-6 transition-colors ${
              isDark
                ? "bg-neutral-900/50 border-neutral-800"
                : "bg-white border-neutral-200 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <IconAlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>Restricted Apps Usage (Last 30 Days)</span>
                </h3>
                <p className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
                  Time spent on monitored domains during focus sessions
                </p>
              </div>
              <span className={`text-xs font-medium ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                {sortedRestrictedSites.length} domain{sortedRestrictedSites.length === 1 ? "" : "s"} tracked
              </span>
            </div>

            {sortedRestrictedSites.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div
                  className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-xl border ${
                    isDark ? "bg-neutral-800 border-neutral-700" : "bg-neutral-100 border-neutral-200"
                  }`}
                >
                  <IconCheckCircle className="w-6 h-6 text-emerald-500" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">No distractions logged in 30 days!</p>
                  <p className={`text-xs max-w-sm mx-auto ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                    Visits to restricted websites like YouTube or Instagram during active sprints will be graphed here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedRestrictedSites.map(([domain, stats]) => {
                  const pct =
                    totalDistractionMs > 0
                      ? Math.min(
                          100,
                          Math.round((stats.totalDuration / totalDistractionMs) * 100),
                        )
                      : 0;

                  return (
                    <div
                      key={domain}
                      className={`space-y-2 p-3.5 rounded-xl border transition-colors ${
                        isDark
                          ? "bg-neutral-850/40 border-neutral-800"
                          : "bg-neutral-50 border-neutral-200/80"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-7 h-7 rounded-lg font-bold flex items-center justify-center text-xs border ${
                              isDark
                                ? "bg-neutral-800 border-neutral-700 text-neutral-200"
                                : "bg-white border-neutral-200 text-neutral-800"
                            }`}
                          >
                            {domain.charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <span className="font-semibold block">{domain}</span>
                            <span className={`text-[11px] ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                              Logged in {stats.sessionCount} focus sprint
                              {stats.sessionCount === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-mono text-sm font-bold block">
                            {formatDuration(stats.totalDuration)}
                          </span>
                          <span className="text-xs text-amber-500 font-medium">
                            {pct}% of distractions
                          </span>
                        </div>
                      </div>

                      {/* Bar indicator */}
                      <div
                        className={`h-1.5 w-full rounded-full overflow-hidden ${
                          isDark ? "bg-neutral-800" : "bg-neutral-200"
                        }`}
                      >
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-500"
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
          <div
            className={`rounded-2xl border p-6 space-y-6 transition-colors ${
              isDark
                ? "bg-neutral-900/50 border-neutral-800"
                : "bg-white border-neutral-200 shadow-sm"
            }`}
          >
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <IconShield className="w-4 h-4 text-neutral-400" />
                <span>Focus Rules & Retention</span>
              </h3>
              <p className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
                Monitored lists & storage policy
              </p>
            </div>

            <div className="space-y-4">
              {/* Retention notice */}
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                  isDark
                    ? "bg-neutral-850/60 border-neutral-800 text-neutral-300"
                    : "bg-neutral-50 border-neutral-200 text-neutral-700"
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  <span>Automatic 30-Day Retention</span>
                </div>
                <p className={isDark ? "text-neutral-400" : "text-neutral-500"}>
                  Older sessions are pruned after 30 days to keep your browser fast, private, and lightweight.
                </p>
              </div>

              {/* Blocked Sites */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span>Hard Blocked Sites</span>
                  </span>
                  <span className={`text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                    Full lockout
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(data.blockedSites ?? ["twitter.com"]).map((site) => (
                    <span
                      key={site}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-mono ${
                        isDark
                          ? "bg-neutral-800 text-neutral-300 border-neutral-700"
                          : "bg-neutral-100 text-neutral-800 border-neutral-200"
                      }`}
                    >
                      {site}
                    </span>
                  ))}
                </div>
              </div>

              {/* Restricted Sites */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>Restricted Sites</span>
                  </span>
                  <span className={`text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                    Distraction banner
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(data.restrictedSites ?? ["youtube.com", "instagram.com"]).map((site) => (
                    <span
                      key={site}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-mono ${
                        isDark
                          ? "bg-neutral-800 text-neutral-300 border-neutral-700"
                          : "bg-neutral-100 text-neutral-800 border-neutral-200"
                      }`}
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
        <section
          className={`rounded-2xl border p-6 space-y-6 transition-colors ${
            isDark
              ? "bg-neutral-900/50 border-neutral-800"
              : "bg-white border-neutral-200 shadow-sm"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base">30-Day Session History</h3>
              <p className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
                Complete record of focus sprints logged over the last month
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Filter Tabs */}
              <div
                className={`flex rounded-xl p-0.5 border text-xs ${
                  isDark ? "bg-neutral-900 border-neutral-800" : "bg-neutral-100 border-neutral-200"
                }`}
              >
                {(["all", "block", "restrict"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setFilterMode(mode)}
                    className={`px-3 py-1 rounded-lg capitalize font-medium transition-all cursor-pointer ${
                      filterMode === mode
                        ? isDark
                          ? "bg-neutral-800 text-white shadow-sm border border-neutral-700"
                          : "bg-white text-neutral-950 shadow-sm border border-neutral-300"
                        : isDark
                          ? "text-neutral-400 hover:text-neutral-200"
                          : "text-neutral-500 hover:text-neutral-900"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {sessions.length > 0 && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isDark
                      ? "text-rose-400 hover:bg-rose-500/10 border-rose-500/20"
                      : "text-rose-600 hover:bg-rose-50 border-rose-200"
                  }`}
                >
                  <IconTrash className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              )}
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="py-14 text-center space-y-3">
              <div
                className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-xl border ${
                  isDark ? "bg-neutral-800 border-neutral-700" : "bg-neutral-100 border-neutral-200"
                }`}
              >
                <IconClock className="w-5 h-5 text-neutral-400" />
              </div>
              <p className="text-sm font-semibold">No session history found</p>
              <p className={`text-xs max-w-sm mx-auto ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                Your completed sprints will be stored and listed here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr
                    className={`border-b uppercase tracking-wider font-semibold ${
                      isDark ? "border-neutral-800 text-neutral-400" : "border-neutral-200 text-neutral-500"
                    }`}
                  >
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Distractions Recorded</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? "divide-neutral-800/60" : "divide-neutral-100"}`}>
                  {filteredSessions.map((session, idx) => {
                    const sessionDistractionEntries = Object.entries(session.siteUsage || {});

                    return (
                      <tr
                        key={idx}
                        className={`transition-colors ${
                          isDark ? "hover:bg-neutral-850/50" : "hover:bg-neutral-50"
                        }`}
                      >
                        <td className="py-3.5 px-4 font-medium">
                          {formatDate(session.startedAt)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md font-medium text-[11px] capitalize border ${
                              session.mode === "block"
                                ? isDark
                                  ? "bg-rose-500/10 text-rose-300 border-rose-500/20"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                                : isDark
                                  ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {session.mode}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-semibold">
                          {formatDuration(session.duration)}
                        </td>
                        <td className="py-3.5 px-4">
                          {sessionDistractionEntries.length === 0 ? (
                            <span className="text-emerald-500 font-medium flex items-center gap-1">
                              <IconCheckCircle className="w-3.5 h-3.5" />
                              <span>Clean Focus</span>
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {sessionDistractionEntries.map(([dom, dur]) => (
                                <span
                                  key={dom}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${
                                    isDark
                                      ? "bg-neutral-800 text-neutral-300 border-neutral-700"
                                      : "bg-neutral-100 text-neutral-800 border-neutral-200"
                                  }`}
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

      {/* CONFIRMATION MODAL */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={`border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl transition-colors ${
              isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
            }`}
          >
            <h4 className="font-bold text-base">Clear 30-Day History?</h4>
            <p className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
              Are you sure you want to delete all recorded focus sessions? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  isDark
                    ? "text-neutral-300 hover:bg-neutral-800"
                    : "text-neutral-700 hover:bg-neutral-100"
                }`}
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

      {/* FOOTER */}
      <footer
        className={`border-t py-6 text-center text-xs transition-colors ${
          isDark ? "border-neutral-800/80 text-neutral-500" : "border-neutral-200 text-neutral-400"
        }`}
      >
        Nudge Focus Extension • Neutral & Chic Productivity Analytics
      </footer>
    </div>
  );
}
