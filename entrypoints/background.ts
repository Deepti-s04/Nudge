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
interface checksites {
  hostname: String;
}
interface BlockedData {
  blockedSites: string[];
}
interface RestrictedData {
  restrictedSites: string[];
}

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
      //CHECK BLOCKED AND RESTRICTED SITES
      else if (msg.message === "check_site") {
          
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

        sendResponse({
          isBlocked,
          isRestricted,
        });
      }
    },
  );
});
