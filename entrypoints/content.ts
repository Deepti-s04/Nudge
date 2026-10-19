export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",

  main() {
    // Only run on top-level pages, never in iframes
    if (window.top !== window.self) {
      return;
    }

    function formatSeconds(totalSec: number) {
      const s = Math.max(0, totalSec);
      const seconds = s % 60;
      const minutes = Math.floor(s / 60) % 60;
      const hours = Math.floor(s / 3600);

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0",
      )}:${String(seconds).padStart(2, "0")}`;
    }

    const hostname = window.location.hostname.replace(/^www\./, "");

    // 1. DISTRACTION BAR
    const distBar = document.createElement("div");
    const warning = document.createElement("h1");
    const timer = document.createElement("p");
    const totalTimer = document.createElement("p");

    distBar.appendChild(warning);
    distBar.appendChild(timer);
    distBar.appendChild(totalTimer);

    distBar.style.position = "fixed";
    distBar.style.top = "0";
    distBar.style.left = "0";
    distBar.style.width = "100%";
    distBar.style.height = "50px";
    distBar.style.backgroundColor = "#be123c";
    distBar.style.color = "white";
    distBar.style.display = "none";
    distBar.style.alignItems = "center";
    distBar.style.justifyContent = "space-between";
    distBar.style.gap = "16px";
    distBar.style.padding = "0 24px";
    distBar.style.boxSizing = "border-box";
    distBar.style.zIndex = "2147483647";
    distBar.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    warning.textContent = "You've been distracted";
    warning.style.fontSize = "16px";
    warning.style.fontWeight = "600";
    warning.style.margin = "0";
    warning.style.padding = "0";
    warning.style.whiteSpace = "nowrap";
    warning.style.flex = "1";
    warning.style.textAlign = "left";

    timer.textContent = "00:00:00";
    timer.style.fontSize = "18px";
    timer.style.fontWeight = "bold";
    timer.style.margin = "0";
    timer.style.padding = "0";
    timer.style.textAlign = "center";
    timer.style.whiteSpace = "nowrap";
    timer.style.letterSpacing = "0.5px";
    timer.style.fontVariantNumeric = "tabular-nums";
    timer.style.minWidth = "110px";
    timer.style.flex = "1";

    totalTimer.textContent = "(This session: 00:00:00)";
    totalTimer.style.fontSize = "13px";
    totalTimer.style.margin = "0";
    totalTimer.style.padding = "0";
    totalTimer.style.whiteSpace = "nowrap";
    totalTimer.style.opacity = "0.9";
    totalTimer.style.fontVariantNumeric = "tabular-nums";
    totalTimer.style.minWidth = "170px";
    totalTimer.style.flex = "1";
    totalTimer.style.textAlign = "right";

    // 2. ULTRA-ATTRACTIVE FLOATING NUDGE WIDGET
    const widgetContainer = document.createElement("div");
    widgetContainer.style.position = "fixed";
    widgetContainer.style.bottom = "20px";
    widgetContainer.style.right = "20px";
    widgetContainer.style.zIndex = "2147483647";
    widgetContainer.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    widgetContainer.style.userSelect = "none";

    // Flyout Card (Panel)
    const flyoutCard = document.createElement("div");
    flyoutCard.style.position = "absolute";
    flyoutCard.style.bottom = "58px";
    flyoutCard.style.right = "0";
    flyoutCard.style.width = "220px";
    flyoutCard.style.background = "rgba(18, 18, 24, 0.94)";
    flyoutCard.style.backdropFilter = "blur(20px)";
    (flyoutCard.style as any).webkitBackdropFilter = "blur(20px)";
    flyoutCard.style.color = "white";
    flyoutCard.style.borderRadius = "18px";
    flyoutCard.style.padding = "16px";
    flyoutCard.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    flyoutCard.style.boxShadow = "0 20px 40px -8px rgba(0, 0, 0, 0.7), 0 0 1px 1px rgba(255, 255, 255, 0.08)";
    flyoutCard.style.boxSizing = "border-box";
    flyoutCard.style.opacity = "0";
    flyoutCard.style.transform = "translateY(10px) scale(0.96)";
    flyoutCard.style.pointerEvents = "none";
    flyoutCard.style.transition = "opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)";

    // Flyout Card Header
    const cardHeader = document.createElement("div");
    cardHeader.style.display = "flex";
    cardHeader.style.alignItems = "center";
    cardHeader.style.justifyContent = "space-between";
    cardHeader.style.marginBottom = "10px";

    const brandTitle = document.createElement("span");
    brandTitle.textContent = "NUDGE FOCUS";
    brandTitle.style.fontSize = "11px";
    brandTitle.style.fontWeight = "800";
    brandTitle.style.letterSpacing = "0.06em";
    brandTitle.style.color = "#a1a1aa";

    const p2 = document.createElement("span");
    p2.textContent = "Idle";
    p2.style.fontSize = "10px";
    p2.style.fontWeight = "600";
    p2.style.padding = "2px 8px";
    p2.style.borderRadius = "999px";
    p2.style.background = "rgba(255, 255, 255, 0.08)";
    p2.style.color = "#a1a1aa";
    p2.style.border = "1px solid rgba(255, 255, 255, 0.08)";
    p2.style.textTransform = "capitalize";

    cardHeader.appendChild(brandTitle);
    cardHeader.appendChild(p2);

    // Timer Section
    const timerLabel = document.createElement("div");
    timerLabel.textContent = "SESSION TIME";
    timerLabel.style.fontSize = "9px";
    timerLabel.style.fontWeight = "700";
    timerLabel.style.letterSpacing = "0.08em";
    timerLabel.style.color = "#71717a";
    timerLabel.style.marginBottom = "2px";

    const p1 = document.createElement("div");
    p1.textContent = "00:00:00";
    p1.style.fontSize = "24px";
    p1.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    p1.style.fontVariantNumeric = "tabular-nums";
    p1.style.color = "#ffffff";
    p1.style.letterSpacing = "-0.02em";
    p1.style.marginBottom = "12px";

    // Divider
    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.background = "rgba(255, 255, 255, 0.08)";
    divider.style.margin = "8px 0 12px 0";

    // View Dashboard Button
    const dashBtn = document.createElement("button");
    dashBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
        <rect x="3" y="3" width="18" height="18" rx="2"></rect>
        <path d="M7 16h2"></path>
        <path d="M11 12h2"></path>
        <path d="M15 8h2"></path>
      </svg>
      <span>View Dashboard</span>
    `;
    dashBtn.style.width = "100%";
    dashBtn.style.padding = "9px 12px";
    dashBtn.style.display = "flex";
    dashBtn.style.alignItems = "center";
    dashBtn.style.justifyContent = "center";
    dashBtn.style.background = "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)";
    dashBtn.style.color = "#ffffff";
    dashBtn.style.fontSize = "12px";
    dashBtn.style.fontWeight = "600";
    dashBtn.style.borderRadius = "10px";
    dashBtn.style.border = "none";
    dashBtn.style.cursor = "pointer";
    dashBtn.style.boxShadow = "0 4px 14px rgba(79, 70, 229, 0.4)";
    dashBtn.style.transition = "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)";
    dashBtn.style.outline = "none";

    dashBtn.addEventListener("mouseenter", () => {
      dashBtn.style.transform = "translateY(-1px)";
      dashBtn.style.filter = "brightness(1.1)";
      dashBtn.style.boxShadow = "0 6px 20px rgba(79, 70, 229, 0.55)";
    });

    dashBtn.addEventListener("mouseleave", () => {
      dashBtn.style.transform = "translateY(0)";
      dashBtn.style.filter = "brightness(1)";
      dashBtn.style.boxShadow = "0 4px 14px rgba(79, 70, 229, 0.4)";
    });

    dashBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await browser.runtime.sendMessage({ message: "open_dashboard" });
      } catch (err) {
        console.error("Could not open dashboard:", err);
      }
    });

    flyoutCard.appendChild(cardHeader);
    flyoutCard.appendChild(timerLabel);
    flyoutCard.appendChild(p1);
    flyoutCard.appendChild(divider);
    flyoutCard.appendChild(dashBtn);

    // Floating Icon Button
    const iconBtn = document.createElement("div");
    iconBtn.style.position = "relative";
    iconBtn.style.width = "48px";
    iconBtn.style.height = "48px";
    iconBtn.style.borderRadius = "50%";
    iconBtn.style.background = "linear-gradient(135deg, #18181b 0%, #09090b 100%)";
    iconBtn.style.border = "1px solid rgba(255, 255, 255, 0.16)";
    iconBtn.style.boxShadow = "0 6px 18px -4px rgba(0, 0, 0, 0.7)";
    iconBtn.style.display = "flex";
    iconBtn.style.alignItems = "center";
    iconBtn.style.justifyContent = "center";
    iconBtn.style.cursor = "pointer";
    iconBtn.style.transition = "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)";

    // Stylized "N" Letter (Matte white/zinc)
    const iconText = document.createElement("span");
    iconText.textContent = "N";
    iconText.style.fontSize = "18px";
    iconText.style.fontWeight = "700";
    iconText.style.color = "#f4f4f5";

    // Status Dot (Green pulse for active focus)
    const statusDot = document.createElement("div");
    statusDot.style.position = "absolute";
    statusDot.style.top = "1px";
    statusDot.style.right = "1px";
    statusDot.style.width = "10px";
    statusDot.style.height = "10px";
    statusDot.style.borderRadius = "50%";
    statusDot.style.background = "#71717a";
    statusDot.style.border = "2px solid #09090b";
    statusDot.style.boxShadow = "0 0 6px rgba(0, 0, 0, 0.5)";
    statusDot.style.transition = "all 0.3s ease";

    iconBtn.appendChild(iconText);
    iconBtn.appendChild(statusDot);

    widgetContainer.appendChild(flyoutCard);
    widgetContainer.appendChild(iconBtn);

    // Interactive Open/Close Logic
    let isMenuOpen = false;
    let hideTimeout: any = null;

    const openMenu = () => {
      if (hideTimeout) clearTimeout(hideTimeout);
      isMenuOpen = true;
      flyoutCard.style.opacity = "1";
      flyoutCard.style.transform = "translateY(0) scale(1)";
      flyoutCard.style.pointerEvents = "auto";
      iconBtn.style.transform = "scale(1.05)";
      iconBtn.style.boxShadow = "0 10px 24px -4px rgba(0, 0, 0, 0.8)";
    };

    const closeMenu = () => {
      isMenuOpen = false;
      flyoutCard.style.opacity = "0";
      flyoutCard.style.transform = "translateY(10px) scale(0.96)";
      flyoutCard.style.pointerEvents = "none";
      iconBtn.style.transform = "scale(1)";
      iconBtn.style.boxShadow = "0 6px 18px -4px rgba(0, 0, 0, 0.7)";
    };

    widgetContainer.addEventListener("mouseenter", () => {
      openMenu();
    });

    widgetContainer.addEventListener("mouseleave", () => {
      hideTimeout = setTimeout(() => {
        closeMenu();
      }, 150);
    });

    iconBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isMenuOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // 3. STATE VARIABLES (Anchored to backend start timestamps)
    const pageLoadTime = Date.now();

    // Detect if this page load is a reload (F5 / Ctrl+R / location.reload())
    const navEntries =
      typeof performance !== "undefined" && typeof performance.getEntriesByType === "function"
        ? (performance.getEntriesByType("navigation") as PerformanceNavigationTiming[])
        : [];
    const isPageReload = navEntries[0]?.type === "reload";

    // Storage keys for per-tab session state
    const visitStorageKey = `nudge_tab_visit_start_${hostname}`;
    const instanceStorageKey = `nudge_tab_instance_${hostname}`;
    const domainSpanStorageKey = `nudge_tab_domain_span_start_${hostname}`;
    const baseUsageStorageKey = `nudge_tab_base_usage_${hostname}`;
    const lastTickStorageKey = `nudge_tab_last_tick_${hostname}`;
    const tabIdStorageKey = `nudge_tab_id_${hostname}`;
    const tabActiveStorageKey = `nudge_tab_active_ms_${hostname}`;

    const getStoredTabActiveMs = (): number => {
      try {
        const val = sessionStorage.getItem(tabActiveStorageKey);
        if (val) {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num >= 0) return num;
        }
      } catch {}
      return 0;
    };

    const persistTabActiveMs = (ms: number) => {
      try {
        if (ms >= 0) {
          sessionStorage.setItem(tabActiveStorageKey, String(ms));
        } else {
          sessionStorage.removeItem(tabActiveStorageKey);
        }
      } catch {}
    };

    const getLastTick = (): number => {
      try {
        const val = sessionStorage.getItem(lastTickStorageKey);
        if (val) {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num > 0) return num;
        }
      } catch {}
      return 0;
    };

    const updateLastTick = () => {
      try {
        sessionStorage.setItem(lastTickStorageKey, String(Date.now()));
      } catch {}
    };

    const getStoredVisitStart = (): number => {
      try {
        const val = sessionStorage.getItem(visitStorageKey);
        if (val) {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num > 0) return num;
        }
      } catch {}
      return 0;
    };

    const persistVisitStart = (start: number) => {
      try {
        if (start > 0) {
          sessionStorage.setItem(visitStorageKey, String(start));
        } else {
          sessionStorage.removeItem(visitStorageKey);
        }
      } catch {}
    };

    const getStoredDomainSpanStart = (): number => {
      try {
        const val = sessionStorage.getItem(domainSpanStorageKey);
        if (val) {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num > 0) return num;
        }
      } catch {}
      return 0;
    };

    const persistDomainSpanStart = (start: number) => {
      try {
        if (start > 0) {
          sessionStorage.setItem(domainSpanStorageKey, String(start));
        } else {
          sessionStorage.removeItem(domainSpanStorageKey);
        }
      } catch {}
    };

    const getStoredBaseUsage = (): number => {
      try {
        const val = sessionStorage.getItem(baseUsageStorageKey);
        if (val) {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num >= 0) return num;
        }
      } catch {}
      return 0;
    };

    const persistBaseUsage = (usage: number) => {
      try {
        if (usage >= 0) {
          sessionStorage.setItem(baseUsageStorageKey, String(usage));
        } else {
          sessionStorage.removeItem(baseUsageStorageKey);
        }
      } catch {}
    };

    const generateUniqueInstanceId = (): string => {
      return "tab_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
    };

    const getStoredTabInstanceId = (): string => {
      try {
        const val = sessionStorage.getItem(instanceStorageKey);
        if (val) return val;
      } catch {}
      return "";
    };

    // If reloading an existing tab OR navigating within the same domain on the same tab,
    // preserve its visit anchor from sessionStorage.
    // If opening a new tab or duplicated tab, start fresh so it does NOT inherit a sibling's visit.
    let tabInstanceId = "";
    let visitStartedAt = 0;
    let domainSpanStartedAt = 0;
    let baseSiteUsageMs = 0;
    // Canonical domain-total snapshot from background (seconds) + when it was taken
    let usageSnapshotSec = 0;
    let usageSnapshotAt = 0;

    const storedVisit = getStoredVisitStart();
    const storedInstance = getStoredTabInstanceId();
    // Only actual page reloads preserve stored visit start from sessionStorage.
    // Duplicated tabs (where isPageReload is false) must start fresh and not inherit timers.
    const isContinuingVisit = isPageReload && storedVisit > 0;

    if (isContinuingVisit) {
      tabInstanceId = storedInstance || generateUniqueInstanceId();
      visitStartedAt = storedVisit > 0 ? storedVisit : pageLoadTime;
      // Never invent a shared domain start from the per-tab visit start
      domainSpanStartedAt = getStoredDomainSpanStart();
      baseSiteUsageMs = getStoredBaseUsage();
      // Wait for storage/sync snapshot so we do not under/over-count the live span
      usageSnapshotSec = 0;
      usageSnapshotAt = 0;
    } else {
      // New navigation or duplicated tab: generate a fresh unique ID
      tabInstanceId = generateUniqueInstanceId();
      visitStartedAt = pageLoadTime;
      domainSpanStartedAt = 0;
      baseSiteUsageMs = 0;
      usageSnapshotSec = 0;
      usageSnapshotAt = 0;
      persistVisitStart(visitStartedAt);
      persistDomainSpanStart(0);
      persistBaseUsage(0);
      persistTabActiveMs(0);
    }
    try {
      sessionStorage.setItem(instanceStorageKey, tabInstanceId);
    } catch {}

    let sessionStartedAt = 0;     // Anchored timestamp when the focus session started
    let isRestrictedPage = false;
    let pageBlocked = false;
    let isSyncing = false;
    let latestSyncSeq = 0;

    // Per-tab persistent blocked state anchor (survives page refresh with 0ms flicker)
    const blockStorageKey = `nudge_tab_blocked_${hostname}`;
    const getSavedBlockedState = (): boolean => {
      try {
        return sessionStorage.getItem(blockStorageKey) === "true";
      } catch {
        return false;
      }
    };

    const persistBlockedState = (isBlocked: boolean) => {
      try {
        if (isBlocked) {
          sessionStorage.setItem(blockStorageKey, "true");
        } else {
          sessionStorage.removeItem(blockStorageKey);
        }
      } catch {}
    };

    // Cache last displayed whole seconds so DOM only updates when whole second changes
    let lastVisitSec = -1;
    let lastTotalSec = -1;
    let lastSessionSec = -1;

    // Robust matcher for blocked domains (including x.com <-> twitter.com aliases)
    function isHostBlocked(host: string, sites: string[]): boolean {
      if (!host) return false;
      const cleanHost = host.trim().toLowerCase().replace(/^www\./, "");
      const cleanSites = sites
        .map((s) =>
          s
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/^www\./, "")
            .replace(/[/?#].*$/, "")
        )
        .filter(Boolean);

      if (cleanSites.includes("twitter.com") && !cleanSites.includes("x.com")) {
        cleanSites.push("x.com");
      }
      if (cleanSites.includes("x.com") && !cleanSites.includes("twitter.com")) {
        cleanSites.push("twitter.com");
      }

      for (const site of cleanSites) {
        if (cleanHost === site || cleanHost.endsWith(`.${site}`)) {
          return true;
        }
      }
      return false;
    }

    function getMatchingSite(host: string, sites: string[]): string | null {
      if (!host) return null;
      const cleanHost = host.trim().toLowerCase().replace(/^www\./, "");
      const cleanSites = sites
        .map((s) =>
          s
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/^www\./, "")
            .replace(/[/?#].*$/, "")
        )
        .filter(Boolean);

      if (cleanSites.includes("twitter.com") && !cleanSites.includes("x.com")) {
        cleanSites.push("x.com");
      }
      if (cleanSites.includes("x.com") && !cleanSites.includes("twitter.com")) {
        cleanSites.push("twitter.com");
      }

      for (const site of cleanSites) {
        if (cleanHost === site || cleanHost.endsWith(`.${site}`)) {
          return site;
        }
      }
      return null;
    }

    const ensureDomInjected = () => {
      if (pageBlocked) return;
      const target = document.body;
      if (!target) {
        if (document.readyState === "loading") {
          document.addEventListener(
            "DOMContentLoaded",
            () => {
              ensureDomInjected();
            },
            { once: true }
          );
        }
        return;
      }
      if (!target.contains(distBar)) {
        target.appendChild(distBar);
      }
      if (!target.contains(widgetContainer)) {
        target.appendChild(widgetContainer);
      }
    };

    let blockObserver: MutationObserver | null = null;

    const removeBlockedPage = () => {
      persistBlockedState(false);
      if (blockObserver) {
        blockObserver.disconnect();
        blockObserver = null;
      }
    };

    // Dedicated function to render an un-bypassable, aesthetic full-page block screen via innerHTML
    const renderBlockedPage = (blockedHost: string) => {
      pageBlocked = true;
      isRestrictedPage = false;
      persistBlockedState(true);

      // 1. Immediately abort pending network loads, scripts, and media on this blocked site
      try {
        window.stop();
      } catch {}

      // Issue 3 Fix: Mute, pause, and detach all pre-buffered media elements to prevent audio leak in background
      try {
        document.querySelectorAll("video, audio").forEach((media) => {
          try {
            const m = media as HTMLMediaElement;
            m.pause();
            m.muted = true;
            m.removeAttribute("src");
            m.load();
          } catch {}
        });
      } catch {}

      // 2. Hide distraction bar and widget if present
      distBar.style.display = "none";
      widgetContainer.style.display = "none";

      // 3. Document level locks
      document.title = `Blocked • Nudge Focus (${blockedHost})`;

      // 4. Construct subtle, minimal blocked page HTML
      const blockedHtml = `
        <div id="nudge-blocked-container" style="
          position: fixed !important;
          inset: 0 !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          background: #09090b !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
          color: #f4f4f5 !important;
          box-sizing: border-box !important;
          padding: 24px !important;
          user-select: none !important;
          z-index: 2147483647 !important;
        ">
          <div style="
            max-width: 380px;
            width: 100%;
            text-align: center;
            box-sizing: border-box;
          ">
            <!-- Subtle status mark -->
            <div style="
              display: inline-flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
              font-weight: 600;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              color: #71717a;
              margin-bottom: 20px;
            ">
              <span style="
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #a1a1aa;
                display: inline-block;
              "></span>
              Nudge Focus
            </div>

            <!-- Clean Direct Title -->
            <h1 style="
              font-size: 22px;
              font-weight: 600;
              color: #fafafa;
              letter-spacing: -0.02em;
              margin: 0 0 8px 0;
              line-height: 1.3;
            ">${blockedHost} is blocked</h1>

            <!-- Understated Subtitle -->
            <p style="
              font-size: 13px;
              color: #71717a;
              line-height: 1.5;
              margin: 0 0 24px 0;
            ">
              This site is blocked during your active focus sprint.
            </p>

            <!-- Quiet Session Duration -->
            <div style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 12px 16px;
              background: rgba(255, 255, 255, 0.03);
              border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 12px;
              margin-bottom: 24px;
            ">
              <span style="font-size: 12px; color: #71717a;">Focus elapsed</span>
              <span id="nudge-blocked-timer" style="
                font-size: 14px;
                font-weight: 600;
                color: #e4e4e7;
                font-variant-numeric: tabular-nums;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              ">${sessionStartedAt > 0 ? formatSeconds(Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000))) : "00:00:00"}</span>
            </div>

            <!-- Clean Action Buttons -->
            <div style="
              display: flex;
              gap: 10px;
              justify-content: center;
            ">
              <button id="nudge-block-back-btn" style="
                flex: 1;
                background: #27272a;
                color: #f4f4f5;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                padding: 9px 16px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.15s ease, border-color 0.15s ease;
                outline: none;
              ">Go back</button>

              <button id="nudge-block-dash-btn" style="
                background: transparent;
                color: #a1a1aa;
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 10px;
                padding: 9px 16px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.15s ease, color 0.15s ease;
                outline: none;
              ">Dashboard</button>
            </div>

            <!-- Quiet Hint -->
            <div style="
              margin-top: 24px;
              font-size: 11px;
              color: #52525b;
              letter-spacing: 0.02em;
            ">Alt + ← to return</div>
          </div>
        </div>
      `;

      // 5. Direct innerHTML assignment to wipe out all page scripts, React roots, and styling
      if (document.documentElement) {
        document.documentElement.innerHTML = `
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Blocked • Nudge Focus (${blockedHost})</title>
            <style>
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #09090b !important;
                overflow: hidden !important;
                width: 100vw !important;
                height: 100vh !important;
              }
            </style>
          </head>
          <body>${blockedHtml}</body>
        `;
      } else if (document.body) {
        document.body.innerHTML = blockedHtml;
        document.body.style.cssText = "margin:0!important;padding:0!important;background:#09090b!important;overflow:hidden!important;";
      }

      // Wire interactive buttons
      const backBtn = document.getElementById("nudge-block-back-btn");
      if (backBtn) {
        backBtn.onmouseenter = () => {
          backBtn.style.background = "#3f3f46";
          backBtn.style.borderColor = "rgba(255, 255, 255, 0.18)";
        };
        backBtn.onmouseleave = () => {
          backBtn.style.background = "#27272a";
          backBtn.style.borderColor = "rgba(255, 255, 255, 0.1)";
        };
        backBtn.onclick = async () => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            try {
              await browser.runtime.sendMessage({ message: "close_current_tab" });
            } catch {
              window.close();
            }
          }
        };
      }

      const dashBtn = document.getElementById("nudge-block-dash-btn");
      if (dashBtn) {
        dashBtn.onmouseenter = () => {
          dashBtn.style.background = "rgba(255, 255, 255, 0.05)";
          dashBtn.style.color = "#f4f4f5";
        };
        dashBtn.onmouseleave = () => {
          dashBtn.style.background = "transparent";
          dashBtn.style.color = "#a1a1aa";
        };
        dashBtn.onclick = async () => {
          try {
            await browser.runtime.sendMessage({ message: "open_dashboard" });
          } catch (e) {
            console.error("Dashboard error:", e);
          }
        };
      }

      // Active Guard: If any external script attempts to wipe or mount over our blocked container, restore it
      if (!blockObserver && document.documentElement) {
        blockObserver = new MutationObserver(() => {
          if (!pageBlocked) return;
          if (!document.getElementById("nudge-blocked-container")) {
            renderBlockedPage(blockedHost);
          }
        });
        blockObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      }

      // DOMContentLoaded hook: if document was still streaming when stop() occurred
      if (document.readyState === "loading") {
        document.addEventListener(
          "DOMContentLoaded",
          () => {
            if (pageBlocked && !document.getElementById("nudge-blocked-container")) {
              renderBlockedPage(blockedHost);
            }
          },
          { once: true }
        );
      }
    };

    // Synchronous refresh recovery from sessionStorage: eliminates any flicker or content flash on page refresh
    if (getSavedBlockedState()) {
      pageBlocked = true;
      renderBlockedPage(hostname);
    }

    // Instant check from local cache - runs at document_start without waiting on service worker
    const checkImmediateBlock = async () => {
      try {
        const data = (await browser.storage.local.get([
          "isActive",
          "mode",
          "blockedSites",
          "startedAt",
        ])) as {
          isActive?: boolean;
          mode?: string;
          blockedSites?: string[];
          startedAt?: number;
        };

        if (data.isActive && data.mode === "block") {
          const sites: string[] = Array.isArray(data.blockedSites) ? data.blockedSites : [];

          if (isHostBlocked(hostname, sites)) {
            if (typeof data.startedAt === "number" && data.startedAt > 0) {
              sessionStartedAt = data.startedAt;
            }
            pageBlocked = true;
            isRestrictedPage = false;
            persistBlockedState(true);
            renderBlockedPage(hostname);
            return true;
          } else if (pageBlocked) {
            pageBlocked = false;
            removeBlockedPage();
            window.location.reload();
            return false;
          }
        } else if (pageBlocked) {
          pageBlocked = false;
          removeBlockedPage();
          window.location.reload();
          return false;
        }
      } catch (err) {
        console.warn("Immediate block check:", err);
      }
      return false;
    };

    // Instant check from local cache for restricted sites (runs at document_start without 00:00:00 flicker)
    const checkImmediateRestricted = async () => {
      try {
        const data = (await browser.storage.local.get([
          "isActive",
          "mode",
          "restrictedSites",
          "startedAt",
          "sessionSiteUsage",
          "domainSpans",
          "activeVisits",
        ])) as {
          isActive?: boolean;
          mode?: string;
          restrictedSites?: string[];
          startedAt?: number;
          sessionSiteUsage?: Record<string, number>;
          domainSpans?: Record<string, any>;
          activeVisits?: Record<string, any>;
        };

        if (data.isActive && data.mode === "restrict") {
          const sites: string[] = Array.isArray(data.restrictedSites) ? data.restrictedSites : [];

          if (isHostBlocked(hostname, sites)) {
            const sStart = typeof data.startedAt === "number" && data.startedAt > 0 ? data.startedAt : 0;
            sessionStartedAt = sStart;
            isRestrictedPage = true;

            const matched = getMatchingSite(hostname, sites) || hostname;

            // Usage ms from prior completed spans
            const usage = data.sessionSiteUsage ?? {};
            if (typeof usage[matched] === "number") {
              baseSiteUsageMs = usage[matched];
              persistBaseUsage(baseSiteUsageMs);
            }

            // Active shared domain span only — never substitute per-tab visit start
            const activeDomainSpan = data.domainSpans?.[matched];
            if (activeDomainSpan?.startedAt && (sStart === 0 || activeDomainSpan.startedAt >= sStart)) {
              domainSpanStartedAt = activeDomainSpan.startedAt;
            } else {
              domainSpanStartedAt = 0;
            }
            persistDomainSpanStart(domainSpanStartedAt);

            const checkNow = Date.now();
            const liveSpanStart = domainSpanStartedAt > 0 ? domainSpanStartedAt : visitStartedAt;
            const effectiveSpanStart =
              liveSpanStart > 0 && sStart > 0 ? Math.max(liveSpanStart, sStart) : liveSpanStart;
            const liveAnchor =
              domainSpanStartedAt === 0 && baseSiteUsageMs > 0
                ? Math.max(effectiveSpanStart, pageLoadTime)
                : effectiveSpanStart;
            const liveMs = liveAnchor > 0 ? Math.max(0, checkNow - liveAnchor) : 0;
            const totalDurationMs = baseSiteUsageMs + liveMs;
            usageSnapshotSec = Math.floor(totalDurationMs / 1000);
            usageSnapshotAt = checkNow - (totalDurationMs % 1000);

            // Tab visit start (per-tab lifetime)
            if (isContinuingVisit) {
              const storedStart = getStoredVisitStart();
              if (storedStart > 0 && (sStart === 0 || storedStart >= sStart)) {
                visitStartedAt = storedStart;
              }
            } else if (!visitStartedAt || visitStartedAt === 0) {
              visitStartedAt = pageLoadTime;
              persistVisitStart(visitStartedAt);
            }

            warning.textContent = "You've been distracted";
            distBar.style.backgroundColor = "#be123c";

            ensureDomInjected();
            distBar.style.display = "flex";
            updateDisplayTimers();
          } else {
            // Issue 4 Fix: If site is not in restricted list, immediately hide distraction bar
            isRestrictedPage = false;
            distBar.style.display = "none";
          }
        } else {
          isRestrictedPage = false;
          distBar.style.display = "none";
        }
      } catch (err) {
        console.warn("Immediate restricted check:", err);
      }
    };

    // 4. REAL-TIME LOCAL TIMER DISPLAY
    // Right: shared domain usage (canonical snapshot + live tick while span open)
    // Middle: per-tab visit lifetime from visitStartedAt (foreground or background)
    const updateDisplayTimers = () => {
      const now = Date.now();

      // Session Timer (Bottom-Right Panel & Fullscreen Blocked Page)
      if (sessionStartedAt > 0) {
        const sessionElapsedSec = Math.max(0, Math.floor((now - sessionStartedAt) / 1000));
        if (sessionElapsedSec !== lastSessionSec) {
          lastSessionSec = sessionElapsedSec;
          p1.textContent = formatSeconds(sessionElapsedSec);

          if (pageBlocked) {
            const blockTimerEl = document.getElementById("nudge-blocked-timer");
            if (blockTimerEl) {
              blockTimerEl.textContent = formatSeconds(sessionElapsedSec);
            } else {
              renderBlockedPage(hostname);
            }
          }
        }
      }

      // Distraction Bar Timers
      if (isRestrictedPage && visitStartedAt > 0) {
        // Right timer: shared domain usage across session (base accumulated ms + live span ms)
        const liveSpanStart = domainSpanStartedAt > 0 ? domainSpanStartedAt : visitStartedAt;
        const effectiveSpanStart =
          liveSpanStart > 0 && sessionStartedAt > 0
            ? Math.max(liveSpanStart, sessionStartedAt)
            : liveSpanStart;
        const liveAnchor =
          domainSpanStartedAt === 0 && baseSiteUsageMs > 0
            ? Math.max(effectiveSpanStart, pageLoadTime)
            : effectiveSpanStart;
        const liveMs = liveAnchor > 0 ? Math.max(0, now - liveAnchor) : 0;
        let totalDurationMs = baseSiteUsageMs + liveMs;
        if (sessionStartedAt > 0) {
          const maxSessionMs = Math.max(0, now - sessionStartedAt);
          if (totalDurationMs > maxSessionMs) {
            totalDurationMs = maxSessionMs;
          }
        }
        let totalSiteSec = Math.floor(totalDurationMs / 1000);

        // Monotonic display guard: total session domain usage never decreases during active session
        if (lastTotalSec >= 0 && totalSiteSec < lastTotalSec) {
          totalSiteSec = lastTotalSec;
        }

        // Middle timer: independent per-tab visit lifetime (not capped by domain total)
        const effectiveVisitStart =
          sessionStartedAt > 0
            ? Math.max(visitStartedAt, sessionStartedAt)
            : visitStartedAt;
        let currentVisitSec = Math.max(
          0,
          Math.floor((now - effectiveVisitStart) / 1000),
        );

        // Monotonic display guard: visit seconds never step backward
        if (lastVisitSec >= 0 && currentVisitSec < lastVisitSec) {
          currentVisitSec = lastVisitSec;
        }

        if (currentVisitSec !== lastVisitSec) {
          lastVisitSec = currentVisitSec;
          timer.textContent = formatSeconds(currentVisitSec);
        }

        if (totalSiteSec !== lastTotalSec) {
          lastTotalSec = totalSiteSec;
          totalTimer.textContent = `(This session: ${formatSeconds(totalSiteSec)})`;
        }

        updateLastTick();
      }
    };

    // 5. ATOMIC SYNC WITH BACKGROUND SCRIPT
    const syncSite = async () => {
      if (isSyncing) return;
      isSyncing = true;
      const syncSeq = ++latestSyncSeq;

      try {
        const isVisible = document.visibilityState === "visible";
        const response = await browser.runtime.sendMessage({
          message: "check_site",
          hostname,
          tabInstanceId,
          tabVisitStartedAt: visitStartedAt,
          isVisible,
        });

        // If background worker is temporarily waking up, or response is stale, do not wipe state
        if (!response || syncSeq !== latestSyncSeq) {
          return;
        }

        if (!response.isActive) {
          persistBlockedState(false);
          if (pageBlocked) {
            pageBlocked = false;
            removeBlockedPage();
            window.location.reload();
            return;
          }

          persistVisitStart(0);
          persistDomainSpanStart(0);
          persistBaseUsage(0);
          persistTabActiveMs(0);
          isRestrictedPage = false;
          visitStartedAt = 0;
          domainSpanStartedAt = 0;
          baseSiteUsageMs = 0;
          usageSnapshotSec = 0;
          usageSnapshotAt = 0;
          sessionStartedAt = 0;
          lastVisitSec = -1;
          lastTotalSec = -1;
          lastSessionSec = -1;

          distBar.style.display = "none";
          p1.textContent = "00:00:00";
          p2.textContent = "Idle";
          p2.style.background = "rgba(255, 255, 255, 0.08)";
          p2.style.color = "#a1a1aa";
          p2.style.border = "1px solid rgba(255, 255, 255, 0.08)";
          statusDot.style.background = "#71717a";
          statusDot.style.boxShadow = "none";
          return;
        }

        sessionStartedAt = response.sessionStartedAt ?? 0;

        // Check if tabId returned reveals this is a duplicated tab
        if (response.tabId !== undefined) {
          try {
            const storedTabId = sessionStorage.getItem(tabIdStorageKey);
            if (storedTabId && storedTabId !== String(response.tabId)) {
              // Different tab ID means this tab was duplicated from another tab!
              tabInstanceId = generateUniqueInstanceId();
              sessionStorage.setItem(instanceStorageKey, tabInstanceId);
              persistVisitStart(response.visitStartedAt || pageLoadTime);
            }
            sessionStorage.setItem(tabIdStorageKey, String(response.tabId));
          } catch {}
        }

        // Active state badge styling
        statusDot.style.background = "#22c55e";
        statusDot.style.boxShadow = "0 0 8px #22c55e";

        const modeStr = response.mode || "";
        p2.textContent = modeStr ? modeStr.charAt(0).toUpperCase() + modeStr.slice(1) : "Active";
        if (modeStr === "restrict") {
          p2.style.background = "rgba(168, 85, 247, 0.15)";
          p2.style.color = "#c084fc";
          p2.style.border = "1px solid rgba(168, 85, 247, 0.3)";
        } else if (modeStr === "block") {
          p2.style.background = "rgba(244, 63, 94, 0.15)";
          p2.style.color = "#fb7185";
          p2.style.border = "1px solid rgba(244, 63, 94, 0.3)";
        }

        // Block Mode
        if (response.isBlocked) {
          pageBlocked = true;
          isRestrictedPage = false;
          if (response.sessionStartedAt) {
            sessionStartedAt = response.sessionStartedAt;
          }
          distBar.style.display = "none";
          widgetContainer.style.display = "none";
          renderBlockedPage(hostname);
          return;
        } else if (pageBlocked && (!response.isActive || response.mode !== "block")) {
          pageBlocked = false;
          removeBlockedPage();
          window.location.reload();
          return;
        } else if (pageBlocked) {
          // Keep blocked page forced active
          renderBlockedPage(hostname);
          return;
        }

        // Restrict Mode Only
        if (response.isRestricted && response.mode === "restrict") {
          isRestrictedPage = true;

          const sStart = response.sessionStartedAt ?? sessionStartedAt;
          sessionStartedAt = sStart;

          // Canonical tab visit start from background — adopt if uninitialized or earlier (never shift into future)
          if (typeof response.visitStartedAt === "number" && response.visitStartedAt > 0) {
            if (visitStartedAt === 0 || response.visitStartedAt <= visitStartedAt) {
              visitStartedAt = response.visitStartedAt;
              persistVisitStart(visitStartedAt);
            }
          }

          // Shared domain span start — 0 means no live span (never use visitStartedAt)
          if (typeof response.domainSpanStartedAt === "number" && response.domainSpanStartedAt > 0) {
            domainSpanStartedAt = response.domainSpanStartedAt;
          } else if (typeof response.domainStartedAt === "number" && response.domainStartedAt > 0) {
            domainSpanStartedAt = response.domainStartedAt;
          } else {
            domainSpanStartedAt = 0;
          }
          persistDomainSpanStart(domainSpanStartedAt);

          // Canonical base site usage from background (completed intervals only)
          const rawBaseUsage =
            typeof response.baseSiteUsageMs === "number"
              ? response.baseSiteUsageMs
              : (typeof response.baseSiteUsage === "number" ? response.baseSiteUsage : 0);
          baseSiteUsageMs = rawBaseUsage;
          persistBaseUsage(baseSiteUsageMs);

          // Prefer background total snapshot (already = base + live span at response time)
          const snapshotAt =
            typeof response.usageSnapshotAt === "number" && response.usageSnapshotAt > 0
              ? response.usageSnapshotAt
              : Date.now();
          if (typeof response.totalSiteUsageSec === "number" && response.totalSiteUsageSec >= 0) {
            // Reconcile snapshot without letting a stale response overwrite newer timer state
            if (snapshotAt >= usageSnapshotAt) {
              usageSnapshotSec = response.totalSiteUsageSec;
              usageSnapshotAt = snapshotAt;
            }
          } else {
            let effectiveSpanStart = 0;
            if (domainSpanStartedAt > 0) {
              effectiveSpanStart =
                sStart > 0 ? Math.max(domainSpanStartedAt, sStart) : domainSpanStartedAt;
            } else if (baseSiteUsageMs === 0 && visitStartedAt > 0) {
              effectiveSpanStart =
                sStart > 0 ? Math.max(visitStartedAt, sStart) : visitStartedAt;
            }
            const liveMs =
              effectiveSpanStart > 0 ? Math.max(0, snapshotAt - effectiveSpanStart) : 0;
            const totalMs = baseSiteUsageMs + liveMs;
            usageSnapshotSec = Math.floor(totalMs / 1000);
            usageSnapshotAt = snapshotAt - (totalMs % 1000);
          }

          warning.textContent = "You've been distracted";
          distBar.style.backgroundColor = "#be123c";

          ensureDomInjected();
          distBar.style.display = "flex";
          updateDisplayTimers();
        } else {
          // Site is not restricted — tear down distraction bar
          isRestrictedPage = false;
          visitStartedAt = 0;
          domainSpanStartedAt = 0;
          baseSiteUsageMs = 0;
          usageSnapshotSec = 0;
          usageSnapshotAt = 0;
          persistVisitStart(0);
          persistDomainSpanStart(0);
          persistBaseUsage(0);
          persistTabActiveMs(0);
          lastVisitSec = -1;
          lastTotalSec = -1;
          distBar.style.display = "none";
          updateDisplayTimers();
        }
      } catch (error) {
        console.error("Nudge sync error:", error);
      } finally {
        isSyncing = false;
      }
    };

    // 6. INITIALIZE IMMEDIATELY
    void checkImmediateBlock();
    void checkImmediateRestricted();
    void syncSite();

    // 7. ULTRA-SMOOTH LOCAL DISPLAY TICK (250ms interval catches second roll-overs with zero drift)
    setInterval(updateDisplayTimers, 250);

    // 8. PERIODIC BACKGROUND SYNC (Every 3 seconds)
    setInterval(() => {
      void syncSite();
    }, 3000);

    // 9. Visibility changes must not pause/reset domain or visit accounting.
    // Keep displaying from current anchors; refresh heartbeat without wiping state.
    document.addEventListener("visibilitychange", () => {
      void syncSite();
    });

    // 10. RE-SYNC ON SPA NAVIGATION & BFCACHE RESTORATION
    const onLocationChange = () => {
      void syncSite();
    };

    window.addEventListener("popstate", onLocationChange);

    // Re-sync and reset leaving flag when page is restored from bfcache (Back/Forward button)
    window.addEventListener("pageshow", (event) => {
      hasNotifiedLeaving = false;
      if (event.persisted) {
        void checkImmediateBlock();
        void checkImmediateRestricted();
        void syncSite();
      }
    });

    // Intercept pushState & replaceState for immediate reaction to in-page SPA navigations
    try {
      const origPush = history.pushState;
      history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
        const ret = origPush.apply(this, args);
        window.dispatchEvent(new Event("nudge_location_change"));
        return ret;
      };
      const origReplace = history.replaceState;
      history.replaceState = function (this: History, ...args: Parameters<History["replaceState"]>) {
        const ret = origReplace.apply(this, args);
        window.dispatchEvent(new Event("nudge_location_change"));
        return ret;
      };
      window.addEventListener("nudge_location_change", onLocationChange);
    } catch {}

    // 10b. NOTIFY BACKGROUND SCRIPT WHEN TAB CLOSES OR UNLOADS
    let hasNotifiedLeaving = false;
    const notifyTabLeaving = () => {
      if (!isRestrictedPage || hasNotifiedLeaving) return;
      hasNotifiedLeaving = true;
      try {
        browser.runtime.sendMessage({
          message: "tab_leaving",
          tabInstanceId,
          hostname,
        });
      } catch {}
    };

    window.addEventListener("pagehide", notifyTabLeaving);
    window.addEventListener("beforeunload", notifyTabLeaving);

    // 11. REACT TO STORAGE CHANGES (e.g. Session start / stop from popup)
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;

      if (
        changes.isActive ||
        changes.mode ||
        changes.blockedSites ||
        changes.restrictedSites ||
        changes.startedAt ||
        changes.domainSpans ||
        changes.sessionSiteUsage
      ) {
        if (
          pageBlocked &&
          (changes.isActive?.newValue === false ||
            changes.mode?.newValue !== "block")
        ) {
          pageBlocked = false;
          removeBlockedPage();
          window.location.reload();
          return;
        }

        if (changes.startedAt && typeof changes.startedAt.newValue === "number") {
          const newStart = changes.startedAt.newValue > 0 ? changes.startedAt.newValue : 0;
          if (newStart !== sessionStartedAt) {
            sessionStartedAt = newStart;
            // Clean reset when a new focus session starts
            if (newStart > 0) {
              baseSiteUsageMs = 0;
              persistBaseUsage(0);
              persistTabActiveMs(0);
              visitStartedAt = pageLoadTime >= newStart ? pageLoadTime : newStart;
              persistVisitStart(visitStartedAt);
              domainSpanStartedAt = 0;
              persistDomainSpanStart(0);
              usageSnapshotSec = 0;
              usageSnapshotAt = 0;
              lastVisitSec = -1;
              lastTotalSec = -1;
              lastSessionSec = -1;
            }
          }
        }

        // If mode changed to something other than "restrict", tear down distraction bar immediately
        if (changes.mode && changes.mode.newValue !== "restrict") {
          isRestrictedPage = false;
          visitStartedAt = 0;
          domainSpanStartedAt = 0;
          baseSiteUsageMs = 0;
          usageSnapshotSec = 0;
          usageSnapshotAt = 0;
          persistVisitStart(0);
          persistDomainSpanStart(0);
          persistBaseUsage(0);
          persistTabActiveMs(0);
          lastVisitSec = -1;
          lastTotalSec = -1;
          distBar.style.display = "none";
        }

        // If restrictedSites changed and current site is no longer restricted, tear down immediately
        if (changes.restrictedSites && Array.isArray(changes.restrictedSites.newValue)) {
          const newSites: string[] = changes.restrictedSites.newValue;
          if (!isHostBlocked(hostname, newSites)) {
            isRestrictedPage = false;
            visitStartedAt = 0;
            domainSpanStartedAt = 0;
            baseSiteUsageMs = 0;
            usageSnapshotSec = 0;
            usageSnapshotAt = 0;
            persistVisitStart(0);
            persistDomainSpanStart(0);
            persistBaseUsage(0);
            persistTabActiveMs(0);
            lastVisitSec = -1;
            lastTotalSec = -1;
            distBar.style.display = "none";
          }
        }

        // Immediately re-check blocked and restricted state from storage on any session changes
        void checkImmediateBlock();
        void checkImmediateRestricted();

        // Only reset visit counters if the session actually ended
        if (changes.isActive?.newValue === false) {
          persistVisitStart(0);
          persistDomainSpanStart(0);
          persistBaseUsage(0);
          persistTabActiveMs(0);
          isRestrictedPage = false;
          visitStartedAt = 0;
          domainSpanStartedAt = 0;
          baseSiteUsageMs = 0;
          usageSnapshotSec = 0;
          usageSnapshotAt = 0;
          sessionStartedAt = 0;
          lastVisitSec = -1;
          lastTotalSec = -1;
          lastSessionSec = -1;
          distBar.style.display = "none";
        }

        void syncSite();
      }
    });
  },
});

