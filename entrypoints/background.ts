// Nudge Background Service Worker (Manifest V3)
interface Message {
  message: string;
  mode?: string;
  hostname?: string;
  tabVisitStartedAt?: number;
}

interface ActiveVisit {
  domain: string;
  hostname: string;
  startedAt: number;
  lastHeartbeat?: number;
}

interface DomainSpan {
  startedAt: number;
  tabIds: string[];
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
  domainSpans?: Record<string, DomainSpan>;
}

const DEFAULT_BLOCKED_SITES = ["x.com", "twitter.com"];
const DEFAULT_RESTRICTED_SITES = ["youtube.com", "instagram.com"];
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeHost(host: string): string {
  if (!host) return "";
  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .trim();
}

function findMatchingSite(hostname: string, sites: string[]): string | null {
  const host = normalizeHost(hostname);
  if (!host) return null;

  // Domain aliases for common rebrands (e.g. twitter.com <-> x.com)
  const normalizedSites = sites.map((s) => normalizeHost(s)).filter(Boolean);
  const expandedSites = [...normalizedSites];
  if (normalizedSites.includes("twitter.com") && !normalizedSites.includes("x.com")) {
    expandedSites.push("x.com");
  }
  if (normalizedSites.includes("x.com") && !normalizedSites.includes("twitter.com")) {
    expandedSites.push("twitter.com");
  }

  for (const domain of expandedSites) {
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

function removeTabFromDomain(
  domainSpans: Record<string, DomainSpan>,
  usage: Record<string, number>,
  domain: string,
  tabKey: string,
  now: number,
) {
  const span = domainSpans[domain];
  if (!span) return;
  const remainingTabs = span.tabIds.filter((id) => id !== tabKey);
  if (remainingTabs.length === 0) {
    addUsage(usage, domain, Math.max(0, now - span.startedAt));
    delete domainSpans[domain];
  } else {
    span.tabIds = remainingTabs;
  }
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
  // CLEANUP ORPHANED VISITS & INITIALIZE DEFAULTS ON STARTUP
  runSerial(async () => {
    try {
      const data = (await browser.storage.local.get([
        "activeVisits",
        "sessionSiteUsage",
        "domainSpans",
        "isActive",
        "blockedSites",
        "restrictedSites",
      ])) as BackgroundData;

      const updates: Record<string, any> = {};

      if (!data.blockedSites || data.blockedSites.length === 0) {
        updates.blockedSites = DEFAULT_BLOCKED_SITES;
      }
      if (!data.restrictedSites || data.restrictedSites.length === 0) {
        updates.restrictedSites = DEFAULT_RESTRICTED_SITES;
      }

      if (data.activeVisits && Object.keys(data.activeVisits).length > 0) {
        const openTabs = await browser.tabs.query({});
        const openTabIds = new Set(openTabs.map((t) => String(t.id)));
        const activeVisits = { ...(data.activeVisits ?? {}) };
        const usage = { ...(data.sessionSiteUsage ?? {}) };
        const domainSpans = { ...(data.domainSpans ?? {}) };
        const now = Date.now();
        let changed = false;

        for (const [tabKey, visit] of Object.entries(activeVisits)) {
          if (!openTabIds.has(tabKey)) {
            delete activeVisits[tabKey];
            removeTabFromDomain(domainSpans, usage, visit.domain, tabKey, now);
            changed = true;
          }
        }

        if (changed) {
          updates.activeVisits = activeVisits;
          updates.sessionSiteUsage = usage;
          updates.domainSpans = domainSpans;
        }
      }

      if (Object.keys(updates).length > 0) {
        await browser.storage.local.set(updates);
      }
    } catch (e) {
      console.warn("Nudge startup cleanup & init error:", e);
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
          domainSpans: {},
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
          "domainSpans",
        ])) as BackgroundData;

        if (!data.isActive || !data.startedAt) {
          return { success: false, error: "No active session" };
        }

        const usage = { ...(data.sessionSiteUsage ?? {}) };
        const domainSpans = { ...(data.domainSpans ?? {}) };

        // Finalize all active domain spans
        for (const [domain, span] of Object.entries(domainSpans)) {
          addUsage(usage, domain, Math.max(0, now - span.startedAt));
        }

        const record: SessionRecord = {
          mode: data.mode ?? "",
          startedAt: data.startedAt,
          endedAt: now,
          duration: now - data.startedAt,
          siteUsage: usage,
        };

        const cutoff = now - THIRTY_DAYS_MS;
        const allSessions = [...(data.sessions ?? []), record];
        // Enforce 30-day retention policy
        const sessions = allSessions.filter((s) => s.startedAt >= cutoff);

        await browser.storage.local.set({
          isActive: false,
          mode: "",
          sessions,
          activeVisits: {},
          sessionSiteUsage: {},
          domainSpans: {},
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

      // 4. CHECK SITE & HEARTBEAT (ATOMIC & CANONICALLY ANCHORED)
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
          "domainSpans",
        ])) as BackgroundData;

        if (!data.isActive) {
          return {
            isActive: false,
            mode: "",
            sessionStartedAt: 0,
            isBlocked: false,
            isRestricted: false,
            visitStartedAt: 0,
            domainStartedAt: 0,
            baseSiteUsage: 0,
          };
        }

        const sessionStart =
          typeof data.startedAt === "number" && data.startedAt > 0
            ? data.startedAt
            : now;

        if (!data.startedAt) {
          await browser.storage.local.set({ startedAt: sessionStart });
        }

        const blockedSites = data.blockedSites ?? DEFAULT_BLOCKED_SITES;
        const restrictedSites = data.restrictedSites ?? DEFAULT_RESTRICTED_SITES;

        const blockedDomain =
          data.mode === "block" ? findMatchingSite(host, blockedSites) : null;
        const restrictedDomain =
          !blockedDomain ? findMatchingSite(host, restrictedSites) : null;

        if (blockedDomain) {
          return {
            isActive: true,
            mode: data.mode ?? "",
            sessionStartedAt: sessionStart,
            isBlocked: true,
            isRestricted: false,
            visitStartedAt: 0,
            domainStartedAt: 0,
            baseSiteUsage: 0,
          };
        }

        const activeVisits = { ...(data.activeVisits ?? {}) };
        const usage = { ...(data.sessionSiteUsage ?? {}) };
        const domainSpans = { ...(data.domainSpans ?? {}) };
        // Resilient tabKey: tabId if available, or domain-keyed fallback
        const tabKey = tabId !== undefined ? String(tabId) : (host ? `tab_${host}` : "main_tab");
        let hasStateChange = false;

        if (tabKey !== undefined) {
          const existing = activeVisits[tabKey];

          // If this tab was visiting another domain, finalize its membership in that domain
          if (existing && existing.domain !== restrictedDomain) {
            removeTabFromDomain(domainSpans, usage, existing.domain, tabKey, now);
            delete activeVisits[tabKey];
            hasStateChange = true;
          }

          if (restrictedDomain) {
            const clientStart =
              typeof msg.tabVisitStartedAt === "number" && msg.tabVisitStartedAt > 0
                ? msg.tabVisitStartedAt
                : now;

            // Start or refresh visit for this tab
            if (!activeVisits[tabKey]) {
              activeVisits[tabKey] = {
                domain: restrictedDomain,
                hostname: host,
                startedAt: clientStart,
                lastHeartbeat: now,
              };
              hasStateChange = true;
            } else {
              activeVisits[tabKey].lastHeartbeat = now;
              // Never advance startedAt forward! Only preserve or align to earlier start
              if (clientStart < activeVisits[tabKey].startedAt) {
                activeVisits[tabKey].startedAt = clientStart;
                hasStateChange = true;
              }
            }

            // Clean up any stale visits from dead tabs (no heartbeat in > 15s)
            for (const [vTabId, visit] of Object.entries(activeVisits)) {
              if (vTabId !== tabKey && now - (visit.lastHeartbeat ?? visit.startedAt) > 15000) {
                removeTabFromDomain(domainSpans, usage, visit.domain, vTabId, now);
                delete activeVisits[vTabId];
                hasStateChange = true;
              }
            }

            // Ensure domain active span is started or tab is included
            let span = domainSpans[restrictedDomain];
            if (!span || span.tabIds.length === 0) {
              span = {
                startedAt: activeVisits[tabKey].startedAt,
                tabIds: [tabKey],
              };
              domainSpans[restrictedDomain] = span;
              hasStateChange = true;
            } else if (!span.tabIds.includes(tabKey)) {
              span.tabIds.push(tabKey);
              hasStateChange = true;
            }

            if (hasStateChange) {
              await browser.storage.local.set({
                activeVisits,
                sessionSiteUsage: usage,
                domainSpans,
              });
            }

            return {
              isActive: true,
              mode: data.mode ?? "",
              sessionStartedAt: sessionStart,
              isBlocked: false,
              isRestricted: true,
              domain: restrictedDomain,
              visitStartedAt: activeVisits[tabKey].startedAt,
              domainStartedAt: span.startedAt,
              baseSiteUsage: usage[restrictedDomain] ?? 0,
            };
          }
        }

        if (hasStateChange) {
          await browser.storage.local.set({
            activeVisits,
            sessionSiteUsage: usage,
            domainSpans,
          });
        }

        return {
          isActive: true,
          mode: data.mode ?? "",
          sessionStartedAt: sessionStart,
          isBlocked: false,
          isRestricted: false,
          visitStartedAt: 0,
          domainStartedAt: 0,
          baseSiteUsage: 0,
        };
      }

      // 5. GET SITE USAGE (BACKWARD COMPATIBILITY)
      if (msg.message === "get_site_usage") {
        const host = normalizeHost(msg.hostname ?? "");
        const data = (await browser.storage.local.get([
          "restrictedSites",
          "sessionSiteUsage",
          "domainSpans",
        ])) as BackgroundData;

        const restrictedSites = data.restrictedSites ?? DEFAULT_RESTRICTED_SITES;
        const matchedDomain = findMatchingSite(host, restrictedSites) ?? host;
        const usage = data.sessionSiteUsage ?? {};
        const domainSpans = data.domainSpans ?? {};
        const span = domainSpans[matchedDomain];
        const activeDuration = span ? Math.max(0, now - span.startedAt) : 0;

        return {
          totalDuration: (usage[matchedDomain] ?? 0) + activeDuration,
        };
      }

      // 6. OPEN DASHBOARD
      if (msg.message === "open_dashboard") {
        const url = browser.runtime.getURL("/dashboard.html");
        await browser.tabs.create({ url });
        return { success: true };
      }

      // 7. CLOSE CURRENT TAB
      if (msg.message === "close_current_tab") {
        if (sender.tab?.id !== undefined) {
          await browser.tabs.remove(sender.tab.id);
        }
        return { success: true };
      }
    }),
  );

  // FINALIZE A VISIT WHEN A TAB NAVIGATES AWAY
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only check navigation when the tab's URL actually changed
    if (!changeInfo.url) return;

    const topHost = safeExtractHost(changeInfo.url);
    if (!topHost) return;

    runSerial(async () => {
      const data = (await browser.storage.local.get([
        "activeVisits",
        "sessionSiteUsage",
        "domainSpans",
        "restrictedSites",
        "isActive",
      ])) as BackgroundData;

      if (!data.isActive) return;

      const tabKey = String(tabId);
      const activeVisits = { ...(data.activeVisits ?? {}) };
      const visit = activeVisits[tabKey];
      if (!visit) return;

      const restrictedSites = data.restrictedSites ?? DEFAULT_RESTRICTED_SITES;
      const visitDomain = visit.domain;
      const newDomain = findMatchingSite(topHost, restrictedSites);

      // If the tab navigated away to another domain or unrestricted site, finalize its visit
      if (newDomain !== visitDomain) {
        delete activeVisits[tabKey];
        const usage = { ...(data.sessionSiteUsage ?? {}) };
        const domainSpans = { ...(data.domainSpans ?? {}) };

        removeTabFromDomain(domainSpans, usage, visitDomain, tabKey, Date.now());

        await browser.storage.local.set({
          activeVisits,
          sessionSiteUsage: usage,
          domainSpans,
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
        "domainSpans",
        "isActive",
      ])) as BackgroundData;

      const tabKey = String(tabId);
      const activeVisits = { ...(data.activeVisits ?? {}) };
      const visit = activeVisits[tabKey];
      if (!visit) return;

      delete activeVisits[tabKey];
      const usage = { ...(data.sessionSiteUsage ?? {}) };
      const domainSpans = { ...(data.domainSpans ?? {}) };

      if (data.isActive && visit.domain) {
        removeTabFromDomain(domainSpans, usage, visit.domain, tabKey, Date.now());
      }

      await browser.storage.local.set({
        activeVisits,
        sessionSiteUsage: usage,
        domainSpans,
      });
    }),
  );
});