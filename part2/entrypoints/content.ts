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
      const hours = Math.floor(totalSec / 3600);

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
    timer.style.flex = "1";

    totalTimer.textContent = "(This session: 00:00:00)";
    totalTimer.style.fontSize = "13px";
    totalTimer.style.margin = "0";
    totalTimer.style.padding = "0";
    totalTimer.style.whiteSpace = "nowrap";
    totalTimer.style.opacity = "0.9";
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

    const ensureDomInjected = () => {
      const parent = document.body || document.documentElement;
      if (!parent) return;
      if (!parent.contains(distBar)) {
        parent.appendChild(distBar);
      }
      if (!parent.contains(widgetContainer)) {
        parent.appendChild(widgetContainer);
      }
    };

    ensureDomInjected();

    let blockObserver: MutationObserver | null = null;

    const removeBlockedPage = () => {
      if (blockObserver) {
        blockObserver.disconnect();
        blockObserver = null;
      }
      const existing = document.getElementById("nudge-blocked-root");
      if (existing) {
        existing.remove();
      }
      const styleEl = document.getElementById("nudge-block-guard-style");
      if (styleEl) {
        styleEl.remove();
      }
      document.documentElement.style.overflow = "";
      if (document.body) {
        document.body.style.overflow = "";
      }
    };

    // Dedicated function to render an un-bypassable, aesthetic full-page block overlay
    const renderBlockedPage = (blockedHost: string) => {
      // 1. Immediately abort all further pending network loads, scripts, and media on this blocked site
      try {
        window.stop();
      } catch (e) {
        // ignore if not allowed
      }

      // 2. Pause and disarm any existing audio/video elements
      try {
        document.querySelectorAll("video, audio").forEach((media) => {
          try {
            (media as HTMLMediaElement).pause();
            (media as HTMLMediaElement).src = "";
            media.remove();
          } catch {}
        });
      } catch {}

      // 3. Document level locks
      document.title = `Blocked • Nudge Focus (${blockedHost})`;

      // Inject aggressive guard CSS to lock scroll and force highest z-index
      let guardStyle = document.getElementById("nudge-block-guard-style") as HTMLStyleElement | null;
      if (!guardStyle) {
        guardStyle = document.createElement("style");
        guardStyle.id = "nudge-block-guard-style";
        guardStyle.textContent = `
          html {
            overflow: hidden !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background-color: #09090b !important;
          }
          body {
            display: none !important;
            overflow: hidden !important;
          }
          #nudge-blocked-root {
            position: fixed !important;
            inset: 0 !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 2147483647 !important;
            background: radial-gradient(circle at 50% 15%, rgba(99, 102, 241, 0.18) 0%, #09090b 70%) !important;
            background-color: #09090b !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            pointer-events: auto !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
        `;
        (document.head || document.documentElement).appendChild(guardStyle);
      }

      // 4. Create or obtain the persistent container
      let blockedRoot = document.getElementById("nudge-blocked-root");
      if (!blockedRoot) {
        blockedRoot = document.createElement("div");
        blockedRoot.id = "nudge-blocked-root";
        blockedRoot.style.cssText = `
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 2147483647 !important;
          background: radial-gradient(circle at 50% 15%, rgba(99, 102, 241, 0.18) 0%, #09090b 70%) !important;
          background-color: #09090b !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          color: #ffffff !important;
          box-sizing: border-box !important;
          padding: 24px !important;
          user-select: none !important;
          pointer-events: auto !important;
          overflow-y: auto !important;
        `;

        blockedRoot.innerHTML = `
          <div style="
            position: relative;
            max-width: 520px;
            width: 100%;
            background: rgba(18, 18, 24, 0.94);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 28px;
            padding: 44px 36px 36px 36px;
            box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.85), 0 0 1px 1px rgba(255, 255, 255, 0.08);
            text-align: center;
            box-sizing: border-box;
          ">
            <!-- Icon Badge -->
            <div style="
              width: 72px;
              height: 72px;
              margin: 0 auto 20px auto;
              border-radius: 22px;
              background: linear-gradient(135deg, rgba(79, 70, 229, 0.22) 0%, rgba(147, 51, 234, 0.22) 100%);
              border: 1px solid rgba(129, 140, 248, 0.35);
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 8px 24px -4px rgba(79, 70, 229, 0.45);
            ">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>

            <!-- Pill Status Badge -->
            <div style="
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 6px 14px;
              border-radius: 999px;
              background: rgba(244, 63, 94, 0.14);
              border: 1px solid rgba(244, 63, 94, 0.32);
              color: #fda4af;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              margin-bottom: 16px;
            ">
              <span style="
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #f43f5e;
                box-shadow: 0 0 8px #f43f5e;
                display: inline-block;
              "></span>
              Focus Mode Active • Site Blocked
            </div>

            <!-- Main Heading -->
            <h1 style="
              font-size: 26px;
              font-weight: 800;
              color: #ffffff;
              letter-spacing: -0.02em;
              margin: 0 0 10px 0;
              line-height: 1.25;
            ">Stay Focused. You're in the Zone.</h1>

            <!-- Subtitle -->
            <p style="
              font-size: 14px;
              color: #a1a1aa;
              line-height: 1.55;
              margin: 0 0 24px 0;
            ">
              Access to <strong style="color: #ffffff; font-weight: 600;">${blockedHost}</strong> is blocked during your Nudge session. Protect your attention and finish what you started.
            </p>

            <!-- Focus Timer Box -->
            <div style="
              background: rgba(9, 9, 11, 0.7);
              border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 18px;
              padding: 18px 20px;
              margin-bottom: 26px;
            ">
              <div style="
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.1em;
                color: #818cf8;
                text-transform: uppercase;
                margin-bottom: 6px;
              ">Current Focus Duration</div>
              <div id="nudge-blocked-timer" style="
                font-size: 34px;
                font-weight: 800;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-variant-numeric: tabular-nums;
                color: #ffffff;
                letter-spacing: 0.02em;
                line-height: 1.1;
              ">00:00:00</div>
              <div style="
                font-size: 12px;
                color: #71717a;
                margin-top: 6px;
              ">Every urge resisted strengthens your focus muscle.</div>
            </div>

            <!-- Action Buttons -->
            <div style="
              display: flex;
              gap: 12px;
              justify-content: center;
              flex-wrap: wrap;
            ">
              <button id="nudge-block-back-btn" style="
                background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
                color: #ffffff;
                border: none;
                border-radius: 12px;
                padding: 12px 22px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
                transition: transform 0.15s ease, filter 0.15s ease;
                outline: none;
              ">← Return to Work</button>

              <button id="nudge-block-dash-btn" style="
                background: rgba(255, 255, 255, 0.06);
                color: #e4e4e7;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 12px;
                padding: 12px 20px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.15s ease, border-color 0.15s ease;
                outline: none;
              ">Open Dashboard</button>
            </div>

            <!-- Footer -->
            <div style="
              margin-top: 24px;
              font-size: 11px;
              font-weight: 600;
              color: #52525b;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            ">Nudge • Digital Wellbeing</div>
          </div>
        `;

        // Event listeners for interactive buttons
        const backBtn = blockedRoot.querySelector("#nudge-block-back-btn");
        if (backBtn) {
          backBtn.addEventListener("mouseenter", () => {
            (backBtn as HTMLElement).style.transform = "translateY(-1px)";
            (backBtn as HTMLElement).style.filter = "brightness(1.1)";
          });
          backBtn.addEventListener("mouseleave", () => {
            (backBtn as HTMLElement).style.transform = "translateY(0)";
            (backBtn as HTMLElement).style.filter = "brightness(1)";
          });
          backBtn.addEventListener("click", async () => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              try {
                await browser.runtime.sendMessage({ message: "close_current_tab" });
              } catch {
                window.close();
              }
            }
          });
        }

        const blockDashBtn = blockedRoot.querySelector("#nudge-block-dash-btn");
        if (blockDashBtn) {
          blockDashBtn.addEventListener("mouseenter", () => {
            (blockDashBtn as HTMLElement).style.background = "rgba(255, 255, 255, 0.1)";
            (blockDashBtn as HTMLElement).style.borderColor = "rgba(255, 255, 255, 0.22)";
          });
          blockDashBtn.addEventListener("mouseleave", () => {
            (blockDashBtn as HTMLElement).style.background = "rgba(255, 255, 255, 0.06)";
            (blockDashBtn as HTMLElement).style.borderColor = "rgba(255, 255, 255, 0.12)";
          });
          blockDashBtn.addEventListener("click", async () => {
            try {
              await browser.runtime.sendMessage({ message: "open_dashboard" });
            } catch (err) {
              console.error("Could not open dashboard:", err);
            }
          });
        }
      }

      // Force-hide document.body so the blocked site cannot render underneath
      if (document.body) {
        document.body.style.setProperty("display", "none", "important");
      }

      // Always re-enforce display properties on the container
      blockedRoot.style.setProperty("display", "flex", "important");
      blockedRoot.style.setProperty("visibility", "visible", "important");
      blockedRoot.style.setProperty("opacity", "1", "important");
      blockedRoot.style.setProperty("z-index", "2147483647", "important");

      // Attach to documentElement so it cannot be wiped by body.innerHTML replacements
      const mountParent = document.documentElement || document.body;
      if (mountParent) {
        if (!mountParent.contains(blockedRoot)) {
          mountParent.appendChild(blockedRoot);
        } else if (mountParent.lastElementChild !== blockedRoot) {
          mountParent.appendChild(blockedRoot);
        }
      }

      // 5. Initial timer update
      if (sessionStartedAt > 0) {
        const initialElapsed = Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000));
        const blockTimerEl = blockedRoot.querySelector("#nudge-blocked-timer");
        if (blockTimerEl) {
          blockTimerEl.textContent = formatSeconds(initialElapsed);
        }
      }

      // 6. Active MutationObserver Guard
      // Ensures our blocked container always stays mounted on top and body remains hidden.
      if (!blockObserver && mountParent) {
        blockObserver = new MutationObserver(() => {
          if (!pageBlocked) return;
          if (document.body && document.body.style.display !== "none") {
            document.body.style.setProperty("display", "none", "important");
          }
          const currentRoot = document.getElementById("nudge-blocked-root");
          if (!currentRoot || !mountParent.contains(currentRoot)) {
            renderBlockedPage(blockedHost);
          } else if (mountParent.lastElementChild !== currentRoot) {
            mountParent.appendChild(currentRoot);
          }
        });

        blockObserver.observe(mountParent, {
          childList: true,
          subtree: true,
        });
      }
    };

    // 3. STATE VARIABLES (Anchored to backend start timestamps)
    let isRestrictedPage = false;
    let pageBlocked = false;
    let visitStartedAt = 0;       // Anchored timestamp when this tab started visiting this domain
    let domainStartedAt = 0;      // Anchored timestamp when the domain's current active span started
    let baseSiteUsage = 0;        // Total duration (ms) from completed visits to this domain
    let sessionStartedAt = 0;     // Anchored timestamp when the focus session started
    let isSyncing = false;

    // Per-tab persistent anchor key for this domain
    const visitStorageKey = `nudge_tab_visit_start_${hostname}`;
    const getSavedVisitStart = (): number => {
      try {
        const val = sessionStorage.getItem(visitStorageKey);
        const parsed = val ? Number(val) : 0;
        return typeof parsed === "number" && !isNaN(parsed) && parsed > 0 ? parsed : 0;
      } catch {
        return 0;
      }
    };
    const persistVisitStart = (ts: number) => {
      try {
        if (ts > 0) {
          sessionStorage.setItem(visitStorageKey, String(ts));
        } else {
          sessionStorage.removeItem(visitStorageKey);
        }
      } catch {}
    };

    // Initialize from sessionStorage if this tab was already on this restricted site
    const existingAnchor = getSavedVisitStart();
    if (existingAnchor > 0) {
      visitStartedAt = existingAnchor;
    }

    // Cache last displayed whole seconds so DOM only updates when whole second changes
    let lastVisitSec = -1;
    let lastTotalSec = -1;
    let lastSessionSec = -1;

    // 4. REAL-TIME LOCAL TIMER DISPLAY (Deterministic tick - no drift, no double counting)
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
        const currentVisitSec = Math.max(0, Math.floor((now - visitStartedAt) / 1000));
        const totalSiteSec = Math.max(
          0,
          Math.floor((baseSiteUsage + Math.max(0, now - domainStartedAt)) / 1000),
        );

        if (currentVisitSec !== lastVisitSec) {
          lastVisitSec = currentVisitSec;
          timer.textContent = formatSeconds(currentVisitSec);
        }

        if (totalSiteSec !== lastTotalSec) {
          lastTotalSec = totalSiteSec;
          totalTimer.textContent = `(This session: ${formatSeconds(totalSiteSec)})`;
        }
      }
    };

    // 5. ATOMIC SYNC WITH BACKGROUND SCRIPT
    const syncSite = async () => {
      if (isSyncing) return;
      isSyncing = true;

      try {
        const response = await browser.runtime.sendMessage({
          message: "check_site",
          hostname,
          tabVisitStartedAt: visitStartedAt > 0 ? visitStartedAt : (getSavedVisitStart() || undefined),
        });

        // If background worker is temporarily waking up, do not wipe state
        if (!response) {
          return;
        }

        if (!response.isActive) {
          if (pageBlocked) {
            pageBlocked = false;
            removeBlockedPage();
            window.location.reload();
            return;
          }

          isRestrictedPage = false;
          visitStartedAt = 0;
          domainStartedAt = 0;
          baseSiteUsage = 0;
          sessionStartedAt = 0;
          lastVisitSec = -1;
          lastTotalSec = -1;
          lastSessionSec = -1;
          persistVisitStart(0);

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

        // Restrict Mode & Monitored Sites in Block Mode
        if (response.isRestricted) {
          isRestrictedPage = true;

          // Anchor visitStartedAt for this tab - NEVER jump forward to Date.now()!
          const saved = getSavedVisitStart();
          if (!visitStartedAt) {
            if (saved > 0) {
              visitStartedAt = saved;
            } else if (response.visitStartedAt && response.visitStartedAt > 0) {
              visitStartedAt = response.visitStartedAt;
            } else {
              visitStartedAt = Date.now();
            }
            persistVisitStart(visitStartedAt);
          } else if (response.visitStartedAt && response.visitStartedAt > 0 && response.visitStartedAt < visitStartedAt) {
            visitStartedAt = response.visitStartedAt;
            persistVisitStart(visitStartedAt);
          }

          if (!domainStartedAt || (response.domainStartedAt && response.domainStartedAt < domainStartedAt)) {
            domainStartedAt = response.domainStartedAt || visitStartedAt;
          }
          baseSiteUsage = response.baseSiteUsage ?? 0;

          if (response.mode === "block") {
            warning.textContent = "Focus Sprint Active (Block Mode)";
            distBar.style.backgroundColor = "#e11d48";
          } else {
            warning.textContent = "You've been distracted";
            distBar.style.backgroundColor = "red";
          }

          ensureDomInjected();
          distBar.style.display = "flex";
          updateDisplayTimers();
        } else {
          // Only tear down restricted UI if the session is inactive or page not restricted
          if (!response.isActive || (response.mode !== "restrict" && response.mode !== "block")) {
            isRestrictedPage = false;
            visitStartedAt = 0;
            domainStartedAt = 0;
            baseSiteUsage = 0;
            lastVisitSec = -1;
            lastTotalSec = -1;
            persistVisitStart(0);
            distBar.style.display = "none";
            updateDisplayTimers();
          }
        }
      } catch (error) {
        console.error("Nudge sync error:", error);
      } finally {
        isSyncing = false;
      }
    };

    // 6. INITIALIZE IMMEDIATELY
    void syncSite();

    // 7. ULTRA-SMOOTH LOCAL DISPLAY TICK (250ms interval catches second roll-overs with zero drift)
    setInterval(updateDisplayTimers, 250);

    // 8. PERIODIC BACKGROUND SYNC (Every 3 seconds)
    setInterval(() => {
      void syncSite();
    }, 3000);

    // 9. RE-SYNC ON TAB VISIBILITY CHANGE
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void syncSite();
      }
    });

    // 10. RE-SYNC ON SPA NAVIGATION
    window.addEventListener("popstate", () => {
      void syncSite();
    });

    // 11. REACT TO STORAGE CHANGES (e.g. Session start / stop from popup)
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;

      if (
        changes.isActive ||
        changes.mode ||
        changes.blockedSites ||
        changes.restrictedSites
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

        // Only reset visit counters if the session actually ended
        if (changes.isActive?.newValue === false) {
          isRestrictedPage = false;
          visitStartedAt = 0;
          domainStartedAt = 0;
          baseSiteUsage = 0;
          sessionStartedAt = 0;
          lastVisitSec = -1;
          lastTotalSec = -1;
          lastSessionSec = -1;
          persistVisitStart(0);
          distBar.style.display = "none";
        }

        void syncSite();
      }
    });
  },
});

