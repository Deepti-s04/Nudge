interface Message {
  message: string;
  mode: string;
  hostname: string;
}

interface Session {
  mode: string;
  duration: number;
}

interface StorageData {
  isActive: boolean;
  mode: string;
  startedAt: number;
  sessions: Session[];
}

interface BlockedData {
  blockedSites: string[];
}

interface RestrictedData {
  restrictedSites: string[];
  restrictedStartedAt: number;
  restrictedHostname: string;
}
interface restrictedObject {
  restrictedHostname: string;
  duration: number;
}
interface ActiveRestrictedTab {
  tabId: number;
  restrictedHostname: string;
  startedAt: number;
  currDuration: number;
}

const activeRestrictedTabs: ActiveRestrictedTab[] = [];

const restrictedUsage: restrictedObject[] = [];

export default defineBackground(() => {
  let blockedSites = ["instagram.com"];
  let restrictedSites = ["youtube.com"];

  browser.runtime.onMessage.addListener(
    async (msg: Message, sender, sendResponse) => {
      // START SESSION
      if (msg.message === "start_session") {
        if (msg.mode == "block") {
          await browser.storage.local.set({
            blockedSites: blockedSites,
          });
        } else if (msg.mode == "restrict") {
          await browser.storage.local.set({
            restrictedSites: restrictedSites,
          });
        }

        const timestamp = Date.now();

        await browser.storage.local.set({
          isActive: true,
          mode: msg.mode,
          startedAt: timestamp,
        });
      }

      // STOP SESSION
      else if (msg.message === "stop_session") {
        const result = (await browser.storage.local.get([
          "startedAt",
          "sessions",
          "mode",
        ])) as StorageData;

        const startedAt = result.startedAt;
        const endedAt = Date.now();

        const sessions = result.sessions || [];

        sessions.push({
          mode: result.mode,
          duration: endedAt - startedAt,
        });

        for(const i of activeRestrictedTabs){
          const duration=endedAt-i.startedAt;
          const host=restrictedUsage.find((item)=>item.restrictedHostname===i.restrictedHostname)
          if(host){
            host.duration+=duration
          }else{
            restrictedUsage.push({
              restrictedHostname:i.restrictedHostname,
              duration:duration
            })
          }   
        }
        activeRestrictedTabs.splice(0,activeRestrictedTabs.length);

        await browser.storage.local.set({
          isActive: false,
          mode: "",
          sessions: sessions,
        });
      }

      // GET CURRENT SESSION
      else if (msg.message === "get_session") {
        const result = (await browser.storage.local.get([
          "isActive",
          "startedAt",
          "mode",
        ])) as StorageData;

        const elapsedTime = result.isActive ? Date.now() - result.startedAt : 0;

        sendResponse({
          isActive: result.isActive,
          elapsedTime: elapsedTime,
          mode: result.mode,
        });
      }

      // CHECK BLOCKED AND RESTRICTED SITES
      else if (msg.message === "check_site") {
        const tabId = sender.tab?.id;
        const result = (await browser.storage.local.get([
          "blockedSites",
          "restrictedSites",
          "isActive",
          "mode",
        ])) as BlockedData & StorageData & RestrictedData;

        const isBlocked =
          result.mode === "block" &&
          result.isActive &&
          result.blockedSites?.includes(msg.hostname);

        const isRestricted =
          result.mode === "restrict" &&
          result.isActive &&
          result.restrictedSites?.includes(msg.hostname);

        // RESTRICTED TIMER
        if (isRestricted) {
          const existing = activeRestrictedTabs.find(
            (item) => item.tabId === tabId,
          );

          if (!existing) {
            activeRestrictedTabs.push({
              tabId: tabId!,
              restrictedHostname: msg.hostname,
              startedAt: Date.now(),
              currDuration: 0,
            });
          } else if (existing.restrictedHostname !== msg.hostname) {
            const exists = restrictedUsage.find(
              (item) => item.restrictedHostname === existing.restrictedHostname,
            );
            if (exists) {
              exists.duration += Date.now() - existing.startedAt;
            } else {
              restrictedUsage.push({
                restrictedHostname: existing.restrictedHostname,
                duration: Date.now() - existing.startedAt,
              });
            }
            existing.restrictedHostname = msg.hostname;
            existing.startedAt = Date.now();
            existing.currDuration = 0;
          }
        } else {
          const activeTab = activeRestrictedTabs.find(
            (item) => item.tabId === tabId,
          );

          if (activeTab) {
            const duration = Date.now() - activeTab.startedAt;

            const existing = restrictedUsage.find(
              (item) =>
                item.restrictedHostname === activeTab.restrictedHostname,
            );

            if (existing) {
              existing.duration += duration;
            } else {
              restrictedUsage.push({
                restrictedHostname: activeTab.restrictedHostname,
                duration: duration,
              });
            }

            activeRestrictedTabs.splice(
              activeRestrictedTabs.indexOf(activeTab),
              1,
            );
          }
        }

        sendResponse({
          isBlocked,
          isRestricted,
        });
      }
    },
  );

  // TAB CLOSE
  browser.tabs.onRemoved.addListener((tabId) => {
    const activeTab = activeRestrictedTabs.find((item) => item.tabId === tabId);

    if (activeTab) {
      const duration = Date.now() - activeTab.startedAt;

      const existing = restrictedUsage.find(
        (item) => item.restrictedHostname === activeTab.restrictedHostname,
      );

      if (existing) {
        existing.duration += duration;
      } else {
        restrictedUsage.push({
          restrictedHostname: activeTab.restrictedHostname,
          duration: duration,
        });
      }

      activeRestrictedTabs.splice(activeRestrictedTabs.indexOf(activeTab), 1);
    }
  });
});
