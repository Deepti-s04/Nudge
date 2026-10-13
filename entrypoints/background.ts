interface Message {
  message: string;
  mode?: string;
  hostname?: string;
}

interface ActiveVisit {
  domain: string;
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
  return host.toLowerCase().trim().replace(/^www\./, "");
}

function findMatchingSite(hostname: string, sites: string[]): string | null {
  const host = normalizeHost(hostname);
  if (!host) return null;

  for (const site of sites) {
    const domain = normalizeHost(site);
    if (!domain) continue;
    if (host === domain || host.endsWith(`.${domain}`)) {
      return domain;
    }
  }
  return null;
}

function safeExtractHost(urlStr?: string): string | null {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr);
    if (!parsed.hostname) return null;
    return normalizeHost(parsed.hostname);
  } catch {
    return null;
  }
}

function addUsage(
  usage: Record<string, number>,
  domain: string,
  duration: number,
) {
  if (duration <= 0 || !domain) return;
  usage[domain] = (usage[domain] ?? 0) + duration;
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
  // CLEANUP ORPHANED VISITS ON STARTUP (e.g. after browser restart or extension reload)
  runSerial(async () => {
    try {
      const data = (await browser.storage.local.get([
        "activeVisits",
        "sessionSiteUsage",
        "isActive",
      ])) as BackgroundData;

      if (!data.activeVisits || Object.keys(data.activeVisits).length === 0) return;

      const openTabs = await browser.tabs.query({});
      const openTabIds = new Set(openTabs.map((t) => String(t.id)));
      const activeVisits = { ...data.activeVisits };
      const usage = { ...(data.sessionSiteUsage ?? {}) };
      let changed = false;

      for (const [tabKey, visit] of Object.entries(activeVisits)) {
        if (!openTabIds.has(tabKey)) {
          delete activeVisits[tabKey];
          changed = true;
        }
      }

      if (changed) {
        await browser.storage.local.set({ activeVisits, sessionSiteUsage: usage });
      }
    } catch (e) {
      console.warn("Nudge startup cleanup error:", e);
    }
  });

  browser.runtime.onMessage.addListener((msg: Message, sender) =>
    runSerial(async () => {
      const now = Date.now();

      // 1. START SESSION
      if (msg.message === "start_session") {
        if (msg.mode !== "block" && msg.mode !== "restrict") {
          return { success: false, error: "Invalid session mode" };
        }

        const stored = (await browser.storage.local.get([
          "sessions",
          "blockedSites",
          "restrictedSites",
          "isActive",
        ])) as BackgroundData;

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

      // 2. STOP SESSION
      if (msg.message === "stop_session") {
        const data = (await browser.storage.local.get([
          "isActive",
          "mode",
          "startedAt",
          "sessions",
          "activeVisits",
          "sessionSiteUsage",
          "restrictedSites",
        ])) as BackgroundData;

        if (!data.isActive || !data.startedAt) {
          return { success: false, error: "No active session" };
        }

        const usage = { ...(data.sessionSiteUsage ?? {}) };
        const restrictedSites = data.restrictedSites ?? DEFAULT_RESTRICTED_SITES;

        // Finalize all active visits
        for (const visit of Object.values(data.activeVisits ?? {})) {
          const domain =
            visit.domain ||
            findMatchingSite(visit.hostname, restrictedSites) ||
            normalizeHost(visit.hostname);
          addUsage(usage, domain, now - visit.startedAt);
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

      // 3. GET CURRENT SESSION
      if (msg.message === "get_session") {
        const data = (await browser.storage.local.get([
          "isActive",
          "startedAt",
          "mode",
        ])) as BackgroundData;

        return {
          isActive: Boolean(data.isActive),
          elapsedTime:
            data.isActive && data.startedAt ? Math.max(0, now - data.startedAt) : 0,
          mode: data.mode ?? "",
        };
      }

      // 4. CHECK SITE & HEARTBEAT (ATOMIC & OPTIMIZED)
      if (msg.message === "check_site") {
        const tabId = sender.tab?.id;
        const rawHostname = msg.hostname ?? "";
        const host = normalizeHost(rawHostname);

        const data = (await browser.storage.local.get([
          "blockedSites",
          "restrictedSites",
          "isActive",
          "mode",
          "startedAt",
          "activeVisits",
          "sessionSiteUsage",
        ])) as BackgroundData;

        const sessionElapsedTime =
          data.isActive && data.startedAt ? Math.max(0, now - data.startedAt) : 0;

        if (!data.isActive) {
          return {
            isActive: false,
            mode: "",
            sessionElapsedTime: 0,
            isBlocked: false,
            isRestricted: false,
            currentDuration: 0,
            baseTotalDuration: 0,
            totalDuration: 0,
          };
        }

        const blockedSites = data.blockedSites ?? DEFAULT_BLOCKED_SITES;
        const restrictedSites = data.restrictedSites ?? DEFAULT_RESTRICTED_SITES;

        const blockedDomain =
          data.mode === "block" ? findMatchingSite(host, blockedSites) : null;
        const restrictedDomain =
          data.mode === "restrict" ? findMatchingSite(host, restrictedSites) : null;

        const activeVisits = { ...(data.activeVisits ?? {}) };
        const usage = { ...(data.sessionSiteUsage ?? {}) };
        const tabKey = tabId !== undefined ? String(tabId) : undefined;

        let currentDuration = 0;
        let baseTotalDuration = 0;
        let isRestricted = false;
        let hasStateChange = false;

        if (tabKey !== undefined) {
          const existing = activeVisits[tabKey];
          const existingDomain = existing
            ? existing.domain ||
              findMatchingSite(existing.hostname, restrictedSites) ||
              normalizeHost(existing.hostname)
            : null;

          // If this tab was visiting another domain, finalize that previous visit
          if (existing && existingDomain !== restrictedDomain) {
            if (existingDomain) {
              addUsage(usage, existingDomain, now - existing.startedAt);
            }
            delete activeVisits[tabKey];
            hasStateChange = true;
          }

          if (restrictedDomain) {
            isRestricted = true;

            // Start new visit if not already active for this canonical domain
            if (!activeVisits[tabKey]) {
              activeVisits[tabKey] = {
                domain: restrictedDomain,
                hostname: host,
                startedAt: now,
              };
              hasStateChange = true;
            }

            const currentVisit = activeVisits[tabKey];
            currentDuration = Math.max(0, now - currentVisit.startedAt);

            // Sum time from other active tabs currently on the same canonical domain
            let otherTabsDuration = 0;
            for (const [vTabId, visit] of Object.entries(activeVisits)) {
              const vDomain =
                visit.domain ||
                findMatchingSite(visit.hostname, restrictedSites) ||
                normalizeHost(visit.hostname);
              if (vTabId !== tabKey && vDomain === restrictedDomain) {
                otherTabsDuration += Math.max(0, now - visit.startedAt);
              }
            }

            const completedUsage = usage[restrictedDomain] ?? 0;
            baseTotalDuration = completedUsage + otherTabsDuration;
          }
        }

        // Only write to disk if an active visit was created or finalized
        if (hasStateChange) {
          await browser.storage.local.set({
            activeVisits,
            sessionSiteUsage: usage,
          });
        }

        return {
          isActive: true,
          mode: data.mode ?? "",
          sessionElapsedTime,
          isBlocked: Boolean(blockedDomain),
          isRestricted,
          domain: restrictedDomain ?? "",
          currentDuration,
          baseTotalDuration,
          totalDuration: baseTotalDuration + currentDuration,
        };
      }

      // 5. GET SITE USAGE (BACKWARD COMPATIBILITY)
      if (msg.message === "get_site_usage") {
        const tabId = sender.tab?.id;
        const host = normalizeHost(msg.hostname ?? "");

        const data = (await browser.storage.local.get([
          "restrictedSites",
          "activeVisits",
          "sessionSiteUsage",
        ])) as BackgroundData;

        const restrictedSites = data.restrictedSites ?? DEFAULT_RESTRICTED_SITES;
        const matchedDomain = findMatchingSite(host, restrictedSites) ?? host;

        const usage = data.sessionSiteUsage ?? {};
        const activeVisits = data.activeVisits ?? {};
        const tabKey = tabId !== undefined ? String(tabId) : undefined;

        let otherTabsDuration = 0;
        for (const [visitTabId, visit] of Object.entries(activeVisits)) {
          const vDomain =
            visit.domain ||
            findMatchingSite(visit.hostname, restrictedSites) ||
            normalizeHost(visit.hostname);
          if (vDomain === matchedDomain && visitTabId !== tabKey) {
            otherTabsDuration += Math.max(0, now - visit.startedAt);
          }
        }

        return {
          totalDuration: (usage[matchedDomain] ?? 0) + otherTabsDuration,
        };
      }
    }),
  );

  // FINALIZE A VISIT WHEN A TAB NAVIGATES AWAY (checks tab.url to avoid false triggers on sub-assets)
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only inspect top-level navigation changes
    if (!changeInfo.url || !tab.url) return;

    const topHost = safeExtractHost(tab.url);
    if (!topHost) return;

    runSerial(async () => {
      const data = (await browser.storage.local.get([
        "activeVisits",
        "sessionSiteUsage",
        "restrictedSites",
        "isActive",
      ])) as BackgroundData;

      if (!data.isActive) return;

      const tabKey = String(tabId);
      const visit = data.activeVisits?.[tabKey];
      if (!visit) return;

      const restrictedSites = data.restrictedSites ?? DEFAULT_RESTRICTED_SITES;
      const visitDomain =
        visit.domain ||
        findMatchingSite(visit.hostname, restrictedSites) ||
        normalizeHost(visit.hostname);
      const newDomain = findMatchingSite(topHost, restrictedSites);

      // If the top-level tab navigated away to another domain or unrestricted site, finalize its visit
      if (newDomain !== visitDomain) {
        const activeVisits = { ...(data.activeVisits ?? {}) };
        const usage = { ...(data.sessionSiteUsage ?? {}) };

        addUsage(usage, visitDomain, Date.now() - visit.startedAt);
        delete activeVisits[tabKey];

        await browser.storage.local.set({
          activeVisits,
          sessionSiteUsage: usage,
        });
      }
    });
  });

  // FINALIZE A VISIT WHEN ITS TAB CLOSES
  browser.tabs.onRemoved.addListener((tabId) =>
    runSerial(async () => {
      const data = (await browser.storage.local.get([
        "activeVisits",
        "sessionSiteUsage",
        "restrictedSites",
        "isActive",
      ])) as BackgroundData;

      const tabKey = String(tabId);
      const visit = data.activeVisits?.[tabKey];
      if (!visit) return;

      const activeVisits = { ...(data.activeVisits ?? {}) };
      const usage = { ...(data.sessionSiteUsage ?? {}) };

      if (data.isActive) {
        const restrictedSites = data.restrictedSites ?? DEFAULT_RESTRICTED_SITES;
        const domain =
          visit.domain ||
          findMatchingSite(visit.hostname, restrictedSites) ||
          normalizeHost(visit.hostname);
        addUsage(usage, domain, Date.now() - visit.startedAt);
      }

      delete activeVisits[tabKey];

      await browser.storage.local.set({
        activeVisits,
        sessionSiteUsage: usage,
      });
    }),
  );
});