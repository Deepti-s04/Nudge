export default defineContentScript({
  matches: ["<all_urls>"],

  main() {
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
    distBar.style.backgroundColor = "red";
    distBar.style.color = "white";
    distBar.style.display = "none";
    distBar.style.alignItems = "center";
    distBar.style.justifyContent = "space-between";
    distBar.style.gap = "16px";
    distBar.style.padding = "0 24px";
    distBar.style.boxSizing = "border-box";
    distBar.style.zIndex = "2147483647"; // Ensure highest stacking context
    distBar.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    warning.textContent = "You've been distracted";
    warning.style.fontSize = "16px";
    warning.style.fontWeight = "600";
    warning.style.margin = "0";
    warning.style.padding = "0";
    warning.style.whiteSpace = "nowrap";

    timer.textContent = "00:00:00";
    timer.style.fontSize = "18px";
    timer.style.fontWeight = "bold";
    timer.style.margin = "0";
    timer.style.padding = "0";
    timer.style.textAlign = "center";
    timer.style.whiteSpace = "nowrap";
    timer.style.letterSpacing = "0.5px";

    totalTimer.textContent = "(This session: 00:00:00)";
    totalTimer.style.fontSize = "13px";
    totalTimer.style.margin = "0";
    totalTimer.style.padding = "0";
    totalTimer.style.whiteSpace = "nowrap";
    totalTimer.style.opacity = "0.9";

    document.body.appendChild(distBar);

    // 2. FLOATING NUDGE PANEL
    const divv = document.createElement("div");
    const div2 = document.createElement("div");
    const heading = document.createElement("h3");
    const p1 = document.createElement("p");
    const p2 = document.createElement("p");
    const icon = document.createElement("div");

    heading.textContent = "Nudge";
    heading.style.fontWeight = "bold";
    heading.style.marginBottom = "8px";
    heading.style.fontSize = "16px";

    p1.textContent = "00:00:00";
    p1.style.fontSize = "18px";
    p1.style.fontWeight = "600";
    p1.style.marginBottom = "4px";

    p2.textContent = "Mode: ";
    p2.style.fontSize = "12px";
    p2.style.color = "#a1a1aa";

    div2.appendChild(heading);
    div2.appendChild(p1);
    div2.appendChild(p2);
    divv.appendChild(div2);

    div2.style.position = "fixed";
    div2.style.bottom = "60px";
    div2.style.right = "10px";
    div2.style.width = "150px";
    div2.style.height = "130px";
    div2.style.background = "#18181b";
    div2.style.color = "white";
    div2.style.borderRadius = "12px";
    div2.style.padding = "16px";
    div2.style.display = "none";
    div2.style.zIndex = "2147483647";
    div2.style.boxShadow = "0 4px 12px rgba(0,0,0,0.4)";
    div2.style.fontFamily = "system-ui, -apple-system, sans-serif";

    icon.innerText = "N";
    icon.style.position = "fixed";
    icon.style.bottom = "20px";
    icon.style.right = "20px";
    icon.style.width = "40px";
    icon.style.height = "40px";
    icon.style.background = "black";
    icon.style.color = "white";
    icon.style.borderRadius = "50%";
    icon.style.display = "flex";
    icon.style.alignItems = "center";
    icon.style.justifyContent = "center";
    icon.style.zIndex = "2147483647";
    icon.style.cursor = "pointer";
    icon.style.fontWeight = "bold";
    icon.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";

    icon.addEventListener("mouseenter", () => {
      div2.style.display = "block";
    });

    icon.addEventListener("mouseleave", () => {
      div2.style.display = "none";
    });

    document.body.appendChild(divv);
    document.body.appendChild(icon);

    // 3. STATE VARIABLES
    let isRestrictedPage = false;
    let pageBlocked = false;
    let visitStartedAt = 0;       // Anchored start timestamp of this visit
    let baseTotalDuration = 0;    // Total duration from past visits + other tabs (ms)
    let sessionStartedAt = 0;     // Anchored start timestamp of the entire focus session
    let isSyncing = false;

    // 4. REAL-TIME LOCAL TIMER DISPLAY (Locked in exact 1.000s unison - never updates prematurely)
    const updateDisplayTimers = () => {
      const now = Date.now();

      if (sessionStartedAt > 0) {
        const sessionElapsedSec = Math.max(0, Math.floor((now - sessionStartedAt) / 1000));
        p1.textContent = formatSeconds(sessionElapsedSec);
      }

      if (isRestrictedPage && visitStartedAt > 0) {
        // Compute whole elapsed seconds of current visit
        const currentVisitSec = Math.max(0, Math.floor((now - visitStartedAt) / 1000));

        // Compute whole seconds of previous usage
        const baseTotalSec = Math.max(0, Math.floor(baseTotalDuration / 1000));

        // Total site seconds is exactly base + current:
        // Because they share currentVisitSec, totalTimer and timer roll over at the EXACT same millisecond!
        const totalSiteSec = baseTotalSec + currentVisitSec;

        timer.textContent = formatSeconds(currentVisitSec);
        totalTimer.textContent = `(This session: ${formatSeconds(totalSiteSec)})`;
      }
    };

    // 5. ATOMIC SYNC WITH BACKGROUND SCRIPT
    const syncSite = async () => {
      if (isSyncing || pageBlocked) return;
      isSyncing = true;

      try {
        const response = await browser.runtime.sendMessage({
          message: "check_site",
          hostname,
        });

        if (!response || !response.isActive) {
          isRestrictedPage = false;
          visitStartedAt = 0;
          baseTotalDuration = 0;
          sessionStartedAt = 0;

          distBar.style.display = "none";
          p1.textContent = "00:00:00";
          p2.textContent = "Mode: ";
          return;
        }

        // Anchor session timer if not already set
        if (sessionStartedAt === 0) {
          sessionStartedAt = Date.now() - (response.sessionElapsedTime ?? 0);
        }
        p2.textContent = `Mode: ${response.mode || ""}`;

        // Block Mode
        if (response.isBlocked) {
          pageBlocked = true;
          distBar.style.display = "none";
          document.body.innerHTML =
            "<div style='display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;'><h1>Fckin go back to studying</h1><p>This website is blocked during your Nudge focus session.</p></div>";
          return;
        }

        // Restrict Mode
        if (response.isRestricted) {
          isRestrictedPage = true;
          baseTotalDuration = response.baseTotalDuration ?? 0;

          // Anchor visitStartedAt ONLY on initial load or refresh (when visitStartedAt is 0).
          // Once anchored, NEVER overwrite it while on this page so timer runs smoothly.
          if (visitStartedAt === 0) {
            visitStartedAt = Date.now() - (response.currentDuration ?? 0);
          }

          distBar.style.display = "flex";
          updateDisplayTimers();
        } else {
          isRestrictedPage = false;
          visitStartedAt = 0;
          baseTotalDuration = 0;
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
    void syncSite();

    // 7. ULTRA-SMOOTH LOCAL DISPLAY TICK (200ms) - Exact, synchronized roll-overs
    setInterval(updateDisplayTimers, 200);

    // 8. PERIODIC BACKGROUND SYNC (Every 2 seconds) - Refreshes base total and session state
    setInterval(() => {
      void syncSite();
    }, 2000);

    // 9. RE-SYNC ON TAB VISIBILITY CHANGE
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void syncSite();
      }
    });

    // 10. REACT TO STORAGE CHANGES (e.g. Session start / stop from popup)
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;

      if (changes.isActive || changes.mode) {
        visitStartedAt = 0;
        sessionStartedAt = 0;
        void syncSite();
      }
    });
  },
});