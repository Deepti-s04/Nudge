export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    const distBar = document.createElement("div");
    const warning = document.createElement("h1");
    const timer = document.createElement("p");
    distBar.appendChild(warning);
    distBar.appendChild(timer);
    document.body.appendChild(distBar);
    distBar.style.display = "none";
    const divv = document.createElement("div");
    const div2 = document.createElement("div");
    const heading = document.createElement("h3");
    const p1 = document.createElement("p");
    const p2 = document.createElement("p");
    const hostname = window.location.hostname.replace("www.", "");
    browser.runtime.sendMessage(
      {
        message: "check_site",
        hostname: hostname,
      },
      (response) => {
        if (response?.isBlocked) {
          document.body.innerHTML =
            "<h1>Welcome</h1><p>This is blocked becuase of nudge focus session.</p>";
        } else if (response?.isRestricted) {
          distBar.style.position = "fixed";
          distBar.style.top = "0";
          distBar.style.left = "0";
          distBar.style.width = "100%";
          distBar.style.height = "50px";
          // distBar.style.background = "#18181b";
          distBar.style.backgroundColor = "red";

          distBar.style.color = "white";
          distBar.style.display = "flex";
          distBar.style.alignItems = "center";
          distBar.style.justifyContent = "space-between";
          distBar.style.padding = "0 20px";
          distBar.style.boxSizing = "border-box";
          distBar.style.zIndex = "999999";

          warning.textContent = "You've been distracted";
          timer.textContent = "00:00:00";
        }
      },
    );

    function msToTime(duration: number) {
      const seconds = Math.floor((duration / 1000) % 60);
      const minutes = Math.floor((duration / (1000 * 60)) % 60);
      const hours = Math.floor(duration / (1000 * 60 * 60));

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    let displayTime: number;
    let mode: string;
    const getSession = () => {
      browser.runtime.sendMessage({ message: "get_session" }, (response) => {
        if (!response.isActive) {
          p1.textContent = "00:00:00";
          p2.textContent = "Mode: ";
          return;
        }
        p1.textContent = msToTime(response.elapsedTime);
        p2.textContent = `Mode: ${response.mode || ""}`;
      });
    };
    getSession();
    const inter = setInterval(() => {
      getSession();
    }, 1000);
    heading.textContent = "Nudge";

    div2.appendChild(heading);
    div2.appendChild(p1);
    div2.appendChild(p2);
    divv.appendChild(div2);

    const icon = document.createElement("div");

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

    icon.addEventListener("mouseenter", () => {
      div2.style.display = "block";
    });

    icon.addEventListener("mouseleave", () => {
      div2.style.display = "none";
    });

    document.body.appendChild(divv);

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

    icon.addEventListener("click", () => {
      console.log("Nudge clicked");
    });

    document.body.appendChild(icon);
  },
});
