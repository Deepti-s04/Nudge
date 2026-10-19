import { useState, useEffect } from "react";

interface SessionRecord {
  mode: string;
  startedAt: number;
  endedAt: number;
  duration: number;
  siteUsage: Record<string, number>;
}

interface BgData {
  isActive?: boolean;
  mode?: string;
  startedAt?: number;
  sessions?: SessionRecord[];
  blockedSites?: string[];
  restrictedSites?: string[];
}

interface DayBar {
  dayLabel: string;
  minutes: number;
  heightPct: number;
  isToday: boolean;
}

const DEFAULT_BLOCKED_SITES: string[] = [];
const DEFAULT_RESTRICTED_SITES: string[] = [];
const NOT_ALLOWED_CURSOR = "not-allowed";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function App() {
  const [view, setView] = useState<"focus" | "profile">("focus");
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState("block");
  const [startedAt, setStartedAt] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  // Site Management State
  const [blockedSites, setBlockedSites] = useState<string[]>([]);
  const [restrictedSites, setRestrictedSites] = useState<string[]>([]);
  const [newBlockedInput, setNewBlockedInput] = useState("");
  const [newRestrictedInput, setNewRestrictedInput] = useState("");

  // Mode hover tooltips
  const [showBlockTooltip, setShowBlockTooltip] = useState(false);
  const [showRestrictTooltip, setShowRestrictTooltip] = useState(false);

  const loadPopupData = async () => {
    try {
      const result = await browser.storage.local.get<BgData>([
        "isActive",
        "mode",
        "startedAt",
        "sessions",
        "blockedSites",
        "restrictedSites",
      ]);

      const active = Boolean(result.isActive);
      const start =
        active && typeof result.startedAt === "number" && result.startedAt > 0
          ? result.startedAt
          : 0;

      setIsActive(active);
      setStartedAt(start);

      // Clean up legacy dummy sites if present
      let bSites: string[] = Array.isArray(result.blockedSites) ? result.blockedSites : [];
      if (bSites.length === 2 && bSites.includes("x.com") && bSites.includes("twitter.com")) {
        bSites = [];
        await browser.storage.local.set({ blockedSites: [] });
      }

      let rSites: string[] = Array.isArray(result.restrictedSites) ? result.restrictedSites : [];
      if (rSites.length === 2 && rSites.includes("youtube.com") && rSites.includes("instagram.com")) {
        rSites = [];
        await browser.storage.local.set({ restrictedSites: [] });
      }

      setBlockedSites(bSites);
      setRestrictedSites(rSites);

      if (result.mode) {
        setMode(result.mode);
      } else if (bSites.length > 0) {
        setMode("block");
      } else if (rSites.length > 0) {
        setMode("restrict");
      }

      if (active && start > 0) {
        setElapsedTime(Math.max(0, Date.now() - start));
      } else {
        setElapsedTime(0);
      }

      const cutoff = Date.now() - THIRTY_DAYS_MS;
      const validSessions = (result.sessions ?? []).filter(
        (s) => s.startedAt >= cutoff,
      );
      setSessions(validSessions);
    } catch (err) {
      console.error("Failed to load popup data:", err);
    }
  };

  useEffect(() => {
    void loadPopupData();

    const onStorageChange = (changes: Record<string, any>, area: string) => {
      if (area !== "local") return;
      // Only reload on actual state/site changes, not periodic background heartbeat writes
      if (
        changes.isActive !== undefined ||
        changes.mode !== undefined ||
        changes.startedAt !== undefined ||
        changes.blockedSites !== undefined ||
        changes.restrictedSites !== undefined ||
        changes.sessions !== undefined
      ) {
        void loadPopupData();
      }
    };
    browser.storage.onChanged.addListener(onStorageChange);

    return () => {
      browser.storage.onChanged.removeListener(onStorageChange);
    };
  }, []);

  // Real-time monotonic tick for active session (zero drift, no reset glitches)
  useEffect(() => {
    if (!isActive || !startedAt) {
      setElapsedTime(0);
      return;
    }

    const updateTimer = () => {
      setElapsedTime(Math.max(0, Date.now() - startedAt));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [isActive, startedAt]);

  const handleToggleSession = async () => {
    if (!isActive) {
      const response = await browser.runtime.sendMessage({
        message: "start_session",
        mode,
      });
      if (response?.success) {
        setIsActive(true);
        const canonicalStart =
          typeof response.startedAt === "number" && response.startedAt > 0
            ? response.startedAt
            : Date.now();
        setStartedAt(canonicalStart);
        setElapsedTime(Math.max(0, Date.now() - canonicalStart));
      }
    } else {
      await browser.runtime.sendMessage({
        message: "stop_session",
        mode,
      });
      setIsActive(false);
      setStartedAt(0);
      setElapsedTime(0);
    }
    void loadPopupData();
  };

  const openDashboard = () => {
    void browser.runtime.sendMessage({ message: "open_dashboard" });
  };

  // Site Management Handlers
  const normalizeDomain = (domain: string): string => {
    return domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[/?#].*$/, "")
      .trim();
  };

  const handleAddBlockedSite = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const domain = normalizeDomain(newBlockedInput);
    if (!domain || blockedSites.includes(domain)) return;
    const updated = [...blockedSites, domain];
    if (domain === "x.com" && !updated.includes("twitter.com")) {
      updated.push("twitter.com");
    } else if (domain === "twitter.com" && !updated.includes("x.com")) {
      updated.push("x.com");
    }
    setBlockedSites(updated);
    setNewBlockedInput("");
    await browser.storage.local.set({ blockedSites: updated });
  };

  const handleRemoveBlockedSite = async (siteToRemove: string) => {
    let updated = blockedSites.filter((s) => s !== siteToRemove);
    if (siteToRemove === "x.com" || siteToRemove === "twitter.com") {
      updated = updated.filter((s) => s !== "x.com" && s !== "twitter.com");
    }
    setBlockedSites(updated);
    await browser.storage.local.set({ blockedSites: updated });
  };

  const handleClearAllBlocked = async () => {
    setBlockedSites([]);
    await browser.storage.local.set({ blockedSites: [] });
  };

  const handleAddRestrictedSite = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const domain = normalizeDomain(newRestrictedInput);
    if (!domain || restrictedSites.includes(domain)) return;
    const updated = [...restrictedSites, domain];
    setRestrictedSites(updated);
    setNewRestrictedInput("");
    await browser.storage.local.set({ restrictedSites: updated });
  };

  const handleRemoveRestrictedSite = async (siteToRemove: string) => {
    const updated = restrictedSites.filter((s) => s !== siteToRemove);
    setRestrictedSites(updated);
    await browser.storage.local.set({ restrictedSites: updated });
  };

  const handleClearAllRestricted = async () => {
    setRestrictedSites([]);
    await browser.storage.local.set({ restrictedSites: [] });
  };

  // Time formatters
  const formatTimerDigits = (ms: number): string => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

  // Last session quick info
  const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  const lastSessionDistractionMs = lastSession
    ? Object.values(lastSession.siteUsage ?? {}).reduce((a, b) => a + b, 0)
    : 0;
  const isLastClean = lastSession && lastSessionDistractionMs === 0;

  // Mini 7-Day Bar Graph
  const last7Days: DayBar[] = [];
  const now = new Date();
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let maxMinutesInWeek = 1;
  const tempDays: { dayLabel: string; minutes: number; isToday: boolean }[] = [];

  for (let i = 6; i >= 0; i--) {
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() - i);
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(targetDate.getDate() + 1);

    const targetStart = targetDate.getTime();
    const targetEnd = nextDate.getTime();

    const daySessions = sessions.filter(
      (s) => s.startedAt >= targetStart && s.startedAt < targetEnd,
    );
    const dayDurationMs = daySessions.reduce((acc, s) => acc + (s.duration || 0), 0);
    const dayMinutes = Math.round(dayDurationMs / 60000);

    if (dayMinutes > maxMinutesInWeek) {
      maxMinutesInWeek = dayMinutes;
    }

    tempDays.push({
      dayLabel: dayLabels[targetDate.getDay()] ?? "",
      minutes: dayMinutes,
      isToday: i === 0,
    });
  }

  for (const item of tempDays) {
    const heightPct = Math.max(
      10,
      Math.round((item.minutes / maxMinutesInWeek) * 100),
    );
    last7Days.push({
      ...item,
      heightPct: item.minutes === 0 ? 8 : heightPct,
    });
  }

  const hasBlockedSites = blockedSites.length > 0;
  const hasRestrictedSites = restrictedSites.length > 0;
  const isBlockedDisabled = !isActive && !hasBlockedSites;
  const isRestrictDisabled = !isActive && !hasRestrictedSites;
  const isStartDisabled = !isActive && (
    (!hasBlockedSites && !hasRestrictedSites) ||
    (mode === "block" && !hasBlockedSites) ||
    (mode === "restrict" && !hasRestrictedSites)
  );

  return (
    <div className="w-[360px] bg-zinc-950 text-zinc-100 p-4 font-sans select-none min-h-[440px] flex flex-col justify-between">
      {/* VIEW 1: MAIN FOCUS TIMER */}
      {view === "focus" && (
        <div className="space-y-4 flex-1 flex flex-col justify-between">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2.5">
              {/* Sleek Matte Icon (Not bright!) */}
              <div className="w-8 h-8 rounded-xl bg-zinc-850 border border-zinc-750 flex items-center justify-center font-bold text-zinc-200 text-sm shadow-sm">
                N
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base tracking-tight text-white">Nudge</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-750">
                    Focus
                  </span>
                </div>
              </div>
            </div>

            {/* Profile Icon Button on the top right */}
            <button
              onClick={() => setView("profile")}
              className="w-8 h-8 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Profile & Settings"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </button>
          </div>

          {/* Simple, Clean Focus Timer Card */}
          <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4 space-y-3.5">
            {/* Status indicator */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-medium">Session Status</span>
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Active Focus
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-750 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500"></span>
                  Ready to focus
                </span>
              )}
            </div>

            {/* Clean Digital Clock */}
            <div className="text-center py-1">
              <div className="font-mono text-4xl font-bold tracking-tight text-white">
                {formatTimerDigits(elapsedTime)}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                {isActive
                  ? `Mode: ${mode.toUpperCase()} • Distraction monitoring on`
                  : "Select mode to start sprint"}
              </p>
            </div>

            {/* Mode Selector */}
            <div className="grid grid-cols-2 gap-2">
              {/* Block Option */}
              <div
                className="relative group"
                onMouseEnter={() => setShowBlockTooltip(true)}
                onMouseLeave={() => setShowBlockTooltip(false)}
                title={isBlockedDisabled ? "No blocked sites selected" : undefined}
              >
                {/* Floating Tooltip */}
                {showBlockTooltip && isBlockedDisabled && (
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-30 px-2 py-0.5 rounded-md bg-zinc-850 border border-zinc-750 text-[10px] font-medium text-zinc-300 shadow-lg pointer-events-none whitespace-nowrap flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0"></span>
                    <span>No blocked sites selected</span>
                  </div>
                )}

                <button
                  disabled={isActive || isBlockedDisabled}
                  onClick={() => !isActive && hasBlockedSites && setMode("block")}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-medium border transition-all ${
                    isBlockedDisabled
                      ? "bg-zinc-900/30 text-zinc-500 border-zinc-800/50 cursor-not-allowed opacity-50"
                      : mode === "block"
                        ? "bg-zinc-800 text-white border-zinc-650 shadow-sm cursor-pointer"
                        : "bg-zinc-850/40 text-zinc-400 border-zinc-800 hover:text-zinc-200 cursor-pointer"
                  } ${isActive ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  🔒 Block
                </button>
              </div>

              {/* Restrict Option */}
              <div
                className="relative group"
                onMouseEnter={() => setShowRestrictTooltip(true)}
                onMouseLeave={() => setShowRestrictTooltip(false)}
                title={isRestrictDisabled ? "No restricted sites selected" : undefined}
              >
                {/* Floating Tooltip */}
                {showRestrictTooltip && isRestrictDisabled && (
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-30 px-2 py-0.5 rounded-md bg-zinc-850 border border-zinc-750 text-[10px] font-medium text-zinc-300 shadow-lg pointer-events-none whitespace-nowrap flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0"></span>
                    <span>No restricted sites selected</span>
                  </div>
                )}

                <button
                  disabled={isActive || isRestrictDisabled}
                  onClick={() => !isActive && hasRestrictedSites && setMode("restrict")}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-medium border transition-all ${
                    isRestrictDisabled
                      ? "bg-zinc-900/30 text-zinc-500 border-zinc-800/50 cursor-not-allowed opacity-50"
                      : mode === "restrict"
                        ? "bg-zinc-800 text-white border-zinc-650 shadow-sm cursor-pointer"
                        : "bg-zinc-850/40 text-zinc-400 border-zinc-800 hover:text-zinc-200 cursor-pointer"
                  } ${isActive ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  ⏱️ Restrict
                </button>
              </div>
            </div>

            {/* Subtle info pills when no sites are configured */}
            {!hasBlockedSites && !hasRestrictedSites && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-zinc-400 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0"></span>
                  <span className="text-[11px] text-zinc-400">No sites configured</span>
                </div>
                <button
                  onClick={() => setView("profile")}
                  className="text-[10px] text-zinc-300 hover:text-white underline cursor-pointer"
                >
                  Add sites →
                </button>
              </div>
            )}

            {!hasBlockedSites && hasRestrictedSites && mode === "block" && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-zinc-400 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0"></span>
                  <span className="text-[11px] text-zinc-400">No blocked sites selected</span>
                </div>
                <button
                  onClick={() => setView("profile")}
                  className="text-[10px] text-zinc-300 hover:text-white underline cursor-pointer"
                >
                  Add sites →
                </button>
              </div>
            )}

            {!hasRestrictedSites && hasBlockedSites && mode === "restrict" && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-zinc-400 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0"></span>
                  <span className="text-[11px] text-zinc-400">No restricted sites selected</span>
                </div>
                <button
                  onClick={() => setView("profile")}
                  className="text-[10px] text-zinc-300 hover:text-white underline cursor-pointer"
                >
                  Add sites →
                </button>
              </div>
            )}

            {/* Action Button */}
            <button
              disabled={isStartDisabled}
              onClick={handleToggleSession}
              style={isStartDisabled ? { cursor: NOT_ALLOWED_CURSOR } : undefined}
              className={`w-full py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all shadow-sm ${
                isActive
                  ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 cursor-pointer"
                  : isStartDisabled
                    ? "bg-zinc-900/60 text-zinc-500 border border-zinc-800/80 opacity-60"
                    : "bg-white hover:bg-zinc-200 text-zinc-950 border border-white cursor-pointer"
              }`}
            >
              {isActive
                ? "Stop Focus Session"
                : !hasBlockedSites && !hasRestrictedSites
                  ? "Add Sites in Settings to Start"
                  : (mode === "block" && !hasBlockedSites) || (mode === "restrict" && !hasRestrictedSites)
                    ? `No ${mode === "block" ? "Blocked" : "Restricted"} Sites Selected`
                    : "Start Focus Session"}
            </button>
          </div>

          {/* Minimalist Summary: Last Session & Mini Bar Chart */}
          <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 font-medium">
                Last:{" "}
                {lastSession ? (
                  <strong className="text-zinc-200 font-mono">
                    {formatShortDuration(lastSession.duration)}
                  </strong>
                ) : (
                  <span className="text-zinc-500">None</span>
                )}
              </span>
              {lastSession && (
                <span className={`text-[10px] font-semibold ${isLastClean ? "text-emerald-400" : "text-amber-400"}`}>
                  {isLastClean ? "Clean 🌟" : `${formatShortDuration(lastSessionDistractionMs)} dist`}
                </span>
              )}
            </div>

            {/* 7-Day Mini Bar Graph (Clean, minimal) */}
            <div className="flex items-end justify-between gap-1.5 h-10 pt-1">
              {last7Days.map((bar, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                  <div
                    title={`${bar.dayLabel}: ${bar.minutes}m focus`}
                    style={{ height: `${bar.heightPct}%` }}
                    className={`w-full rounded-t-xs transition-all ${
                      bar.minutes > 0
                        ? bar.isToday
                          ? "bg-white"
                          : "bg-zinc-500"
                        : "bg-zinc-800"
                    }`}
                  />
                  <span className={`text-[8px] font-mono leading-none ${bar.isToday ? "text-zinc-200 font-bold" : "text-zinc-500"}`}>
                    {bar.dayLabel.charAt(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: PROFILE & SETTINGS (Manage Blocked/Restricted Sites + Dashboard Option) */}
      {view === "profile" && (
        <div className="space-y-4 flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <button
              onClick={() => setView("focus")}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>←</span>
              <span>Back</span>
            </button>
            <h3 className="text-xs font-semibold text-zinc-200">Settings & Rules</h3>
            <div className="w-8"></div>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto pr-0.5">
            {/* Dashboard Option Card */}
            <div className="rounded-xl bg-zinc-900/70 border border-zinc-800 p-3 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Analytics
              </div>
              <button
                onClick={openDashboard}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 text-xs text-white transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-md bg-zinc-800 group-hover:bg-zinc-700 text-sm">
                    📊
                  </span>
                  <div className="text-left">
                    <span className="font-semibold block text-zinc-100">Open Full Dashboard</span>
                    <span className="text-[10px] text-zinc-400">30-day stats, graphs & breakdown</span>
                  </div>
                </div>
                <span className="text-zinc-400 group-hover:text-white transition-colors">↗</span>
              </button>
            </div>

            {/* Manage Restricted Sites */}
            <div className="rounded-xl bg-zinc-900/70 border border-zinc-800 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-zinc-200 block">Restricted Sites</span>
                  <span className="text-[10px] text-zinc-400">Shows reminder banner & timer</span>
                </div>
                <div className="flex items-center gap-2">
                  {restrictedSites.length > 0 && (
                    <button
                      onClick={handleClearAllRestricted}
                      className="text-[10px] text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Remove all restricted sites"
                    >
                      Clear all
                    </button>
                  )}
                  <span className="text-[10px] text-amber-400 font-mono font-medium">
                    {restrictedSites.length} active
                  </span>
                </div>
              </div>

              {/* Tag List */}
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {restrictedSites.length === 0 ? (
                  <span className="text-xs text-zinc-500 italic">No restricted sites added</span>
                ) : (
                  restrictedSites.map((site) => (
                    <span
                      key={site}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 text-[11px] border border-zinc-750 font-mono"
                    >
                      <span>{site}</span>
                      <button
                        onClick={() => handleRemoveRestrictedSite(site)}
                        className="text-zinc-400 hover:text-rose-400 cursor-pointer text-xs ml-0.5"
                        title={`Remove ${site}`}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Add form */}
              <form onSubmit={handleAddRestrictedSite} className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  placeholder="e.g. reddit.com"
                  value={newRestrictedInput}
                  onChange={(e) => setNewRestrictedInput(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
                <button
                  type="submit"
                  disabled={!newRestrictedInput.trim()}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-medium text-white transition-colors cursor-pointer"
                >
                  + Add
                </button>
              </form>
            </div>

            {/* Manage Blocked Sites */}
            <div className="rounded-xl bg-zinc-900/70 border border-zinc-800 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-zinc-200 block">Blocked Sites</span>
                  <span className="text-[10px] text-zinc-400">Hard lockout screen during Block mode</span>
                </div>
                <div className="flex items-center gap-2">
                  {blockedSites.length > 0 && (
                    <button
                      onClick={handleClearAllBlocked}
                      className="text-[10px] text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Remove all blocked sites"
                    >
                      Clear all
                    </button>
                  )}
                  <span className="text-[10px] text-rose-400 font-mono font-medium">
                    {blockedSites.length} active
                  </span>
                </div>
              </div>

              {/* Tag List */}
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {blockedSites.length === 0 ? (
                  <span className="text-xs text-zinc-500 italic">No blocked sites added</span>
                ) : (
                  blockedSites.map((site) => (
                    <span
                      key={site}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 text-[11px] border border-zinc-750 font-mono"
                    >
                      <span>{site}</span>
                      <button
                        onClick={() => handleRemoveBlockedSite(site)}
                        className="text-zinc-400 hover:text-rose-400 cursor-pointer text-xs ml-0.5"
                        title={`Remove ${site}`}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Add form */}
              <form onSubmit={handleAddBlockedSite} className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  placeholder="e.g. twitter.com"
                  value={newBlockedInput}
                  onChange={(e) => setNewBlockedInput(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
                <button
                  type="submit"
                  disabled={!newBlockedInput.trim()}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-medium text-white transition-colors cursor-pointer"
                >
                  + Add
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}