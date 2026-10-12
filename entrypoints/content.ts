export default defineContentScript({
  matches: ["<all_urls>"],

  main() {
    function msToTime(duration: number) {
      const seconds = Math.floor((duration / 1000) % 60);
      const minutes = Math.floor((duration / 60000) % 60);
      const hours = Math.floor(duration / 3600000);

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0",
      )}:${String(seconds).padStart(2, "0")}`;
    }

    const hostname = window.location.hostname.replace(/^www\./, "");

    // DISTRACTION BAR
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
    distBar.style.padding = "0 20px";
    distBar.style.boxSizing = "border-box";
    distBar.style.zIndex = "999999";

    warning.textContent = "You've been distracted";
    timer.textContent = "00:00:00";
    totalTimer.textContent = "Previous total: 00:00:00";

    totalTimer.style.fontSize = "12px";
    totalTimer.style.whiteSpace = "nowrap";

    document.body.appendChild(distBar);

    // FLOATING NUDGE PANEL
    const divv = document.createElement("div");
    const div2 = document.createElement("div");
    const heading = document.createElement("h3");
    const p1 = document.createElement("p");
    const p2 = document.createElement("p");
    const icon = document.createElement("div");

    heading.textContent = "Nudge";

    div2.appendChild(heading);
    div2.appendChild(p1);
    div2.appendChild(p2);
    divv.appendChild(div2);

    div2.style.position = "fixed";
    div2.style.bottom = "60px";
    div2.style.right = "10px";
    div2.style.width = "150px";
    div2.style.height = "200px";
    div2.style.background = "#18181b";
    div2.style.color = "white";
    div2.style.borderRadius = "12px";
    div2.style.padding = "16px";
    div2.style.display = "none";
    div2.style.zIndex = "999999";

    icon.innerText = "N";

    icon.style.position = "fixed";
    icon.style.bottom = "20px";
    icon.style.right = "20px";
    icon.style.width = "50px";
    icon.style.height = "50px";
    icon.style.background = "black";
    icon.style.color = "white";
    icon.style.borderRadius = "50%";
    icon.style.display = "flex";
    icon.style.alignItems = "center";
    icon.style.justifyContent = "center";
    icon.style.zIndex = "999999";
    icon.style.cursor = "pointer";

    icon.addEventListener("mouseenter", () => {
      div2.style.display = "block";
    });

    icon.addEventListener("mouseleave", () => {
      div2.style.display = "none";
    });

    document.body.appendChild(divv);
    document.body.appendChild(icon);

    // TIMER AND STATE VARIABLES
    let restrictedVisitStartedAt = 0;
    let totalDuration = 0;
    let isRestrictedPage = false;
    let isChecking = false;
    let pageBlocked = false;

    // CHECK CURRENT WEBSITE
    const checkSite = async () => {
      if (isChecking || pageBlocked) return;

      isChecking = true;

      try {
        console.log("CONTENT URL:", window.location.href);
        console.log("CONTENT HOSTNAME:", window.location.hostname);
        const response = await browser.runtime.sendMessage({
          message: "check_site",
          hostname,
        });

        if (response?.isBlocked) {
          pageBlocked = true;

          document.body.innerHTML =
            "<h1>Fckin go back to studying</h1><p>This is blocked because of Nudge focus session.</p>";

          return;
        }

        if (response?.isRestricted) {
          isRestrictedPage = true;

          const currentDuration = response.currentDuration ?? 0;
          totalDuration = response.totalDuration ?? 0;

          // Convert elapsed time into a timestamp for the live timer.
          restrictedVisitStartedAt = Date.now() - currentDuration;

          distBar.style.display = "flex";
          timer.textContent = msToTime(currentDuration);
          totalTimer.textContent = `(This session: ${msToTime(totalDuration + currentDuration)})`;
        } else {
          isRestrictedPage = false;
          restrictedVisitStartedAt = 0;
          totalDuration = 0;

          timer.textContent = "00:00:00";
          totalTimer.textContent = "Previous total: 00:00:00";
          distBar.style.display = "none";
        }
      } catch (error) {
        console.error("Nudge check_site error:", error);
      } finally {
        isChecking = false;
      }
    };
    let isGettingSession = false;

    // UPDATE SESSION AND WEBSITE TIMERS
    const getSession = async () => {
  if (isGettingSession) return;

  isGettingSession = true;
  console.time("getSession");

  try {
        const response = await browser.runtime.sendMessage({
          message: "get_session",
        });

        if (!response?.isActive) {
          p1.textContent = "00:00:00";
          p2.textContent = "Mode: ";

          isRestrictedPage = false;
          restrictedVisitStartedAt = 0;
          totalDuration = 0;
          distBar.style.display = "none";

          return;
        }

        p1.textContent = msToTime(response.elapsedTime ?? 0);
        p2.textContent = `Mode: ${response.mode || ""}`;

        // BLOCK MODE: enforce the blocked-sites list.
        if (response.mode === "block") {
          isRestrictedPage = false;
          restrictedVisitStartedAt = 0;
          totalDuration = 0;
          distBar.style.display = "none";

          await checkSite();
          return;
        }

        // Hide the distraction bar for any other non-restrict mode.
        if (response.mode !== "restrict") {
          isRestrictedPage = false;
          restrictedVisitStartedAt = 0;
          totalDuration = 0;
          distBar.style.display = "none";
          return;
        }

        // RESTRICT MODE
        if (!isRestrictedPage) {
          await checkSite();
        }

        if (isRestrictedPage && restrictedVisitStartedAt) {
          const currentDuration = Date.now() - restrictedVisitStartedAt;

          const usageResponse = await browser.runtime.sendMessage({
            message: "get_site_usage",
            hostname,
          });

          totalDuration = usageResponse?.totalDuration ?? totalDuration;

          timer.textContent = msToTime(currentDuration);
          totalTimer.textContent = `(This session: ${msToTime(totalDuration + currentDuration)})`;
        }
      } catch (error) {
        console.error("Nudge get_session error:", error);
      } finally {
  isGettingSession = false;
  console.timeEnd("getSession");
}
    };

    // INITIALIZE
    void getSession();

    // UPDATE EVERY SECOND
    setInterval(() => {
      void getSession();
    }, 1000);

    // REACT TO SESSION START/STOP OR MODE CHANGES
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;

      if (changes.isActive || changes.mode) {
        isRestrictedPage = false;
        restrictedVisitStartedAt = 0;
        totalDuration = 0;

        void getSession();
      }
    });
  },
});
