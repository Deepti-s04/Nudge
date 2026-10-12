interface Message {
  message: string;
  mode?: string;
  hostname?: string;
}

interface ActiveVisit {
  hostname: string;
  startedAt: number;
}

interface SessionRecord {
  mode: string;
  startedAt: number;
  endedAt: number;
  duration: number;
  siteUsage: Record<string, number>;
}

interface BackgroundData {
  isActive?: boolean;
  mode?: string;
  startedAt?: number;
  sessions?: SessionRecord[];
  blockedSites?: string[];
  restrictedSites?: string[];
  activeVisits?: Record<string, ActiveVisit>;
  sessionSiteUsage?: Record<string, number>;
}

const DEFAULT_BLOCKED_SITES = ["twitter.com"];
const DEFAULT_RESTRICTED_SITES = ["youtube.com", "instagram.com"];

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function matchesSite(hostname: string, sites: string[]): boolean {
  const host = normalizeHost(hostname);

  return sites.some((site) => {
    const domain = normalizeHost(site);
    return host === domain || host.endsWith(`.${domain}`);
  });
}

function addUsage(
  usage: Record<string, number>,
  hostname: string,
  duration: number,
) {
  if (duration <= 0) return;

  usage[hostname] = (usage[hostname] ?? 0) + duration;
}

let stateQueue: Promise<void> = Promise.resolve();

function runSerial<T>(task: () => Promise<T>): Promise<T> {
  const result = stateQueue.then(
    () => task(),
    () => task(),
  );

  stateQueue = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Message, sender) =>
  runSerial(async () => {
    // START SESSION
    if (msg.message === "start_session") {
      if (msg.mode !== "block" && msg.mode !== "restrict") {
        return { success: false, error: "Invalid session mode" };
      }

      const now = Date.now();

      const stored = (await browser.storage.local.get([
        "sessions",
        "blockedSites",
        "restrictedSites",
        "isActive",
      ])) as BackgroundData;

      // Don't silently overwrite a running session.
      if (stored.isActive) {
        return { success: false, error: "A session is already active" };
      }

      await browser.storage.local.set({
        blockedSites: stored.blockedSites ?? DEFAULT_BLOCKED_SITES,
        restrictedSites: stored.restrictedSites ?? DEFAULT_RESTRICTED_SITES,
        isActive: true,
        mode: msg.mode,
        startedAt: now,
        activeVisits: {},
        sessionSiteUsage: {},
      });

      return { success: true };
    }

    // STOP SESSION
    if (msg.message === "stop_session") {
      const data = (await browser.storage.local.get([
        "isActive",
        "mode",
        "startedAt",
        "sessions",
        "activeVisits",
        "sessionSiteUsage",
      ])) as BackgroundData;

      if (!data.isActive || !data.startedAt) {
        return { success: false, error: "No active session" };
      }

      const now = Date.now();
      const usage = { ...(data.sessionSiteUsage ?? {}) };

      // Finalize all visits that are still active.
      for (const visit of Object.values(data.activeVisits ?? {})) {
        addUsage(usage, visit.hostname, now - visit.startedAt);
      }

      const record: SessionRecord = {
        mode: data.mode ?? "",
        startedAt: data.startedAt,
        endedAt: now,
        duration: now - data.startedAt,
        siteUsage: usage,
      };

      const sessions = [...(data.sessions ?? []), record];

      await browser.storage.local.set({
        isActive: false,
        mode: "",
        sessions,
        activeVisits: {},
        sessionSiteUsage: {},
      });

      return { success: true };
    }

    // GET CURRENT SESSION
    if (msg.message === "get_session") {
      console.log("MESSAGE RECEIVED:", msg);

      const data = (await browser.storage.local.get([
        "isActive",
        "startedAt",
        "mode",
      ])) as BackgroundData;

      return {
        isActive: Boolean(data.isActive),
        elapsedTime:
          data.isActive && data.startedAt ? Date.now() - data.startedAt : 0,
        mode: data.mode ?? "",
      };
    }

    if (msg.message === "get_site_usage") {
      const tabId = sender.tab?.id;
      const hostname = normalizeHost(msg.hostname ?? "");

      const data = (await browser.storage.local.get([
        "activeVisits",
        "sessionSiteUsage",
      ])) as BackgroundData;

      const usage = data.sessionSiteUsage ?? {};
      const activeVisits = data.activeVisits ?? {};
      const currentTabKey = tabId !== undefined ? String(tabId) : undefined;

      const now = Date.now();
      let otherTabsDuration = 0;

      for (const [visitTabId, visit] of Object.entries(activeVisits)) {
        if (visit.hostname === hostname && visitTabId !== currentTabKey) {
          otherTabsDuration += Math.max(0, now - visit.startedAt);
        }
      }

      return {
        totalDuration: (usage[hostname] ?? 0) + otherTabsDuration,
      };
    }

    // CHECK WHETHER THE CURRENT WEBSITE IS BLOCKED OR RESTRICTED
    if (msg.message === "check_site") {
      const tabId = sender.tab?.id;
      const hostname = normalizeHost(msg.hostname ?? "");

      const data = (await browser.storage.local.get([
        "blockedSites",
        "restrictedSites",
        "isActive",
        "mode",
        "activeVisits",
        "sessionSiteUsage",
      ])) as BackgroundData;

      const blockedSites = data.blockedSites ?? DEFAULT_BLOCKED_SITES;
      const restrictedSites = data.restrictedSites ?? DEFAULT_RESTRICTED_SITES;

      const isBlocked =
        Boolean(data.isActive) &&
        data.mode === "block" &&
        matchesSite(hostname, blockedSites);

      const isRestricted =
        Boolean(data.isActive) &&
        data.mode === "restrict" &&
        matchesSite(hostname, restrictedSites);

      const activeVisits = { ...(data.activeVisits ?? {}) };
      const usage = { ...(data.sessionSiteUsage ?? {}) };
      const now = Date.now();

      let currentDuration = 0;

      if (tabId !== undefined) {
        const key = String(tabId);
        const existing = activeVisits[key];

        // Finalize the previous visit when leaving its website.
        if (existing && (!isRestricted || existing.hostname !== hostname)) {
          addUsage(usage, existing.hostname, now - existing.startedAt);
          delete activeVisits[key];
        }

        // Start or continue this tab's current restricted visit.
        if (isRestricted) {
          if (!activeVisits[key]) {
            activeVisits[key] = {
              hostname,
              startedAt: now,
            };
          }

          currentDuration = Math.max(0, now - activeVisits[key].startedAt);
        }
      }

      // Persist updated usage and active visits.
      await browser.storage.local.set({
        activeVisits,
        sessionSiteUsage: usage,
      });

      const saved = await browser.storage.local.get([
        "activeVisits",
        "sessionSiteUsage",
      ]);

      console.log("SAVED USAGE:", saved.sessionSiteUsage);
      console.log("ACTIVE VISITS:", saved.activeVisits);

      let otherTabsDuration = 0;
      const currentTabKey = tabId !== undefined ? String(tabId) : undefined;

      for (const [visitTabId, visit] of Object.entries(activeVisits)) {
        if (visit.hostname === hostname && visitTabId !== currentTabKey) {
          const duration = Math.max(0, now - visit.startedAt);
          otherTabsDuration += duration;
        }
      }

      return {
        isBlocked,
        isRestricted,
        currentDuration,
        totalDuration: (usage[hostname] ?? 0) + otherTabsDuration,
      };
    }
    }),
);
  // FINALIZE A VISIT WHEN ITS TAB CLOSES
 browser.tabs.onRemoved.addListener((tabId) =>
  runSerial(async () => {
    const data = (await browser.storage.local.get([
      "activeVisits",
      "sessionSiteUsage",
      "isActive",
    ])) as BackgroundData;

    const activeVisits = { ...(data.activeVisits ?? {}) };
    const usage = { ...(data.sessionSiteUsage ?? {}) };
    const key = String(tabId);
    const visit = activeVisits[key];

    if (!visit) return;

    if (data.isActive) {
      addUsage(usage, visit.hostname, Date.now() - visit.startedAt);
    }

    delete activeVisits[key];

    await browser.storage.local.set({
      activeVisits,
      sessionSiteUsage: usage,
    });
   }),
);
});
