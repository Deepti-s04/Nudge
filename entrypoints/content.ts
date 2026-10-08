
export default defineContentScript({
  matches: ["<all_urls>"],

  main() {
    function msToTime(duration: number) {
      const seconds = Math.floor((duration / 1000) % 60);
      const minutes = Math.floor((duration / 60000) % 60);
      const hours = Math.floor(duration / 3600000);

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    const hostname = window.location.hostname.replace(/^www\./, "");

    // DISTRACTION BAR
    const distBar = document.createElement("div");
    const warning = document.createElement("h1");
    const timer = document.createElement("p");

    distBar.appendChild(warning);
    distBar.appendChild(timer);

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
    distBar.style.padding = "0 20px";
    distBar.style.boxSizing = "border-box";
    distBar.style.zIndex = "999999";

    warning.textContent = "You've been distracted";

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

    let restrictedStartedAt = 0;
    let isChecking = false;
    let pageBlocked = false;

    // Check current website and initialize its timer.
    const checkSite = async () => {
      if (isChecking || pageBlocked) return;

      isChecking = true;

      try {
        const response = await browser.runtime.sendMessage({
          message: "check_site",
          hostname: window.location.hostname.replace(/^www\./, ""),
        });

        if (response?.isBlocked) {
          pageBlocked = true;

          document.body.innerHTML =
            "<h1>Welcome</h1><p>This is blocked because of Nudge focus session.</p>";

          return;
        }

        if (
          response?.isRestricted &&
          response.restrictedStartedAt
        ) {
          restrictedStartedAt = response.restrictedStartedAt;
          distBar.style.display = "flex";
        } else {
          restrictedStartedAt = 0;
          distBar.style.display = "none";
        }
      } catch (error) {
        console.error("Nudge check_site error:", error);
      } finally {
        isChecking = false;
      }
    };

    // Overall focus session timer.
    const getSession = async () => {
      try {
        const response = await browser.runtime.sendMessage({
          message: "get_session",
        });

        if (!response?.isActive) {
          p1.textContent = "00:00:00";
          p2.textContent = "Mode: ";

          restrictedStartedAt = 0;
          distBar.style.display = "none";

          return;
        }

        p1.textContent = msToTime(response.elapsedTime);
        p2.textContent = `Mode: ${response.mode || ""}`;

        // Restricted bar should only run in restrict mode.
        if (response.mode !== "restrict") {
          restrictedStartedAt = 0;
          distBar.style.display = "none";
          return;
        }

        // Initialize a new restricted timer if needed.
        if (!restrictedStartedAt) {
          await checkSite();
        }

        if (restrictedStartedAt) {
          timer.textContent = msToTime(
            Date.now() - restrictedStartedAt
          );
        }
      } catch (error) {
        console.error("Nudge get_session error:", error);
      }
    };

    // Initialize both timers.
    void checkSite();
    void getSession();

    // Update once per second.
    setInterval(() => {
      void getSession();
    }, 1000);

    // Handle session changes immediately.
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;

      if (changes.isActive || changes.mode) {
        restrictedStartedAt = 0;
        void checkSite();
        void getSession();
      }
    });
  },
});
