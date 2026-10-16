// Nudge Background Service Worker (Manifest V3)
interface Message {
  message: string;
  mode?: string;
  hostname?: string;
  tabInstanceId?: string;
  tabVisitStartedAt?: number;
}

interface ActiveVisit {
  domain: string;
  hostname: string;
  startedAt: number;
  lastHeartbeat: number;
  tabId?: number;
  instanceId?: string;
}

interface DomainSpan {
  startedAt: number;
  tabKeys: string[];
  lastHeartbeat?: number;
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

const DEFAULT_BLOCKED_SITES: string[] = [];
const DEFAULT_RESTRICTED_SITES: string[] = [];
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const HEARTBEAT_TIMEOUT_MS = 15000;

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

function finalizeVisit(
  activeVisits: Record<string, ActiveVisit>,
  domainSpans: Record<string, DomainSpan>,
  usage: Record<string, number>,
  tabIdentifier: string,
  now: number,
): boolean {
  if (!tabIdentifier) return false;
  let changed = false;
  const domainsToRecheck = new Set<string>();
  let lastHeartbeatTime = now;

  for (const [key, visit] of Object.entries(activeVisits)) {
    if (
      key === tabIdentifier ||
      visit.instanceId === tabIdentifier ||
      (visit.tabId !== undefined && String(visit.tabId) === tabIdentifier)
    ) {
      domainsToRecheck.add(visit.domain);
      if (visit.lastHeartbeat && visit.lastHeartbeat > 0) {
        lastHeartbeatTime = Math.min(now, visit.lastHeartbeat);
      }
      delete activeVisits[key];
      changed = true;
    }
  }

  for (const domain of domainsToRecheck) {
    const span = domainSpans[domain];
    if (span) {
      span.tabKeys = span.tabKeys.filter((k) => {
        if (k === tabIdentifier) return false;
        const v = activeVisits[k];
        return (
          v !== undefined &&
          v.domain === domain
        );
      });

      const remainingVisitsForDomain = Object.values(activeVisits).some(
        (v) => v.domain === domain,
      );

      if (span.tabKeys.length === 0 || !remainingVisitsForDomain) {
        const effectiveHeartbeat = span.lastHeartbeat || lastHeartbeatTime;
        const endTime = Math.max(span.startedAt, Math.min(now, effectiveHeartbeat || now));
        const duration = Math.max(0, endTime - span.startedAt);
        if (duration > 0) {
          usage[domain] = (usage[domain] ?? 0) + duration;
        }
        delete domainSpans[domain];
        changed = true;
      }
    }
  }

  return changed;
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

      if (data.blockedSites === undefined) {
        updates.blockedSites = [];
      } else if (
        Array.isArray(data.blockedSites) &&
        data.blockedSites.length === 2 &&
        data.blockedSites.includes("x.com") &&
        data.blockedSites.includes("twitter.com")
      ) {
        updates.blockedSites = [];
      }

      if (data.restrictedSites === undefined) {
        updates.restrictedSites = [];
      } else if (
        Array.isArray(data.restrictedSites) &&
        data.restrictedSites.length === 2 &&
        data.restrictedSites.includes("youtube.com") &&
        data.restrictedSites.includes("instagram.com")
      ) {
        updates.restrictedSites = [];
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
          const tabIdStr = visit.tabId !== undefined ? String(visit.tabId) : tabKey;
          if (!openTabIds.has(tabIdStr)) {
            finalizeVisit(activeVisits, domainSpans, usage, tabKey, visit.lastHeartbeat || now);
            changed = true;
          }
        }

        for (const [domain, span] of Object.entries(domainSpans)) {
          const remainingForDomain = Object.values(activeVisits).filter((v) => v.domain === domain);
          if (remainingForDomain.length === 0) {
            const effectiveHeartbeat = span.lastHeartbeat || now;
            const endTime = Math.max(span.startedAt, Math.min(now, effectiveHeartbeat));
            const duration = Math.max(0, endTime - span.startedAt);
            if (duration > 0) {
              usage[domain] = (usage[domain] ?? 0) + duration;
            }
            delete domainSpans[domain];
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

        const sessionUpdates: Record<string, any> = {
          isActive: true,
          mode: msg.mode,
          startedAt: now,
          activeVisits: {},
          sessionSiteUsage: {},
          domainSpans: {},
        };
        if (stored.blockedSites === undefined) {
          sessionUpdates.blockedSites = DEFAULT_BLOCKED_SITES;
        }
        if (stored.restrictedSites === undefined) {
          sessionUpdates.restrictedSites = DEFAULT_RESTRICTED_SITES;
        }
        await browser.storage.local.set(sessionUpdates);

        return { success: true, startedAt: now };
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
          startedAt: 0,
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
          startedAt: data.isActive && data.startedAt ? data.startedAt : 0,
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

        const blockedSites = data.blockedSites ?? [];
        const restrictedSites = data.restrictedSites ?? [];

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
        const rawTabId = sender.tab?.id;
        const instanceId = msg.tabInstanceId || "";
        const tabKey =
          rawTabId !== undefined
            ? String(rawTabId)
            : (instanceId || (host ? `tab_${host}` : "main_tab"));
        let hasStateChange = false;

        // Deduplicate: clean up any other active visit entry sharing the exact same instanceId
        if (instanceId) {
          for (const [k, v] of Object.entries(activeVisits)) {
            if (k !== tabKey && v.instanceId === instanceId) {
              delete activeVisits[k];
              hasStateChange = true;
            }
          }
        }

        // Reconcile with currently open browser tabs: if tab is closed, finalize immediately
        try {
          const openTabs = await browser.tabs.query({});
          const openTabIds = new Set(openTabs.map((t) => String(t.id)));
          for (const [k, v] of Object.entries(activeVisits)) {
            const vTabId = v.tabId !== undefined ? String(v.tabId) : k;
            if (k !== tabKey && v.tabId !== undefined && !openTabIds.has(vTabId)) {
              finalizeVisit(activeVisits, domainSpans, usage, k, v.lastHeartbeat || now);
              hasStateChange = true;
            }
          }
        } catch {}

        // Prune any abandoned visits with missing tabs or stale headless instance heartbeats
        for (const [k, v] of Object.entries(activeVisits)) {
          if (v.tabId === undefined && now - v.lastHeartbeat > 60000) {
            finalizeVisit(activeVisits, domainSpans, usage, k, v.lastHeartbeat || now);
            hasStateChange = true;
          }
        }

        // Clean up any domain spans that have no remaining active visits
        for (const [domain, span] of Object.entries(domainSpans)) {
          const hasActiveVisit = Object.values(activeVisits).some(
            (v) => v.domain === domain
          );
          if (!hasActiveVisit) {
            const effectiveHeartbeat = span.lastHeartbeat || now;
            const endTime = Math.max(span.startedAt, Math.min(now, effectiveHeartbeat));
            const duration = Math.max(0, endTime - span.startedAt);
            if (duration > 0) {
              usage[domain] = (usage[domain] ?? 0) + duration;
            }
            delete domainSpans[domain];
            hasStateChange = true;
          }
        }

        const existing = activeVisits[tabKey];

        // Only finalize the visit if the tab navigated away to a different domain or an unrestricted site
        if (existing && existing.domain !== restrictedDomain) {
          const changed = finalizeVisit(activeVisits, domainSpans, usage, tabKey, now);
          if (changed) hasStateChange = true;
        }

        if (restrictedDomain) {
          const rawClientStart =
            typeof msg.tabVisitStartedAt === "number" && msg.tabVisitStartedAt > 0
              ? msg.tabVisitStartedAt
              : now;
          const clientStart = Math.max(rawClientStart, sessionStart);

          // Check if this specific tab was already active on this domain
          const isTabContinuing =
            existing !== undefined &&
            existing.domain === restrictedDomain;

          let currentVisit = existing;
          if (!isTabContinuing || !currentVisit) {
            currentVisit = {
              domain: restrictedDomain,
              hostname: host,
              tabId: rawTabId,
              instanceId,
              startedAt: clientStart,
              lastHeartbeat: now,
            };
            activeVisits[tabKey] = currentVisit;
            hasStateChange = true;
          } else {
            // Tab is continuing on the same restricted domain (e.g. reload or heartbeat)
            currentVisit.lastHeartbeat = now;
            currentVisit.instanceId = instanceId;
            if (rawTabId !== undefined && currentVisit.tabId === undefined) {
              currentVisit.tabId = rawTabId;
              hasStateChange = true;
            }
            // If the client possesses a valid earlier visit start (anchored in sessionStorage across rapid reload), respect it
            if (rawClientStart > 0 && rawClientStart < currentVisit.startedAt) {
              currentVisit.startedAt = Math.max(rawClientStart, sessionStart);
              hasStateChange = true;
            }
          }

          let span = domainSpans[restrictedDomain];
          if (!span) {
            // Start a fresh domain span starting at this visit start
            span = {
              startedAt: currentVisit.startedAt,
              tabKeys: [tabKey],
              lastHeartbeat: now,
            };
            domainSpans[restrictedDomain] = span;
            hasStateChange = true;
          } else {
            // Span already active on this domain with other tabs or continuing visit
            span.lastHeartbeat = now;
            if (!span.tabKeys.includes(tabKey)) {
              span.tabKeys.push(tabKey);
              hasStateChange = true;
            }
          }

          // Always persist state on check_site for restricted sites so heartbeats and visit tracking are never lost
          await browser.storage.local.set({
            activeVisits,
            sessionSiteUsage: usage,
            domainSpans,
          });

          const activeDuration = span ? Math.max(0, now - span.startedAt) : 0;
          const rawTotalDuration = (usage[restrictedDomain] ?? 0) + activeDuration;

          return {
            isActive: true,
            mode: data.mode ?? "",
            sessionStartedAt: sessionStart,
            isBlocked: false,
            isRestricted: true,
            domain: restrictedDomain,
            visitStartedAt: currentVisit.startedAt,
            domainStartedAt: span ? span.startedAt : currentVisit.startedAt,
            baseSiteUsage: usage[restrictedDomain] ?? 0,
            totalSiteUsageSec: Math.floor(rawTotalDuration / 1000),
          };
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

      // 5. TAB LEAVING / UNLOAD
      if (msg.message === "tab_leaving") {
        const rawTabId = sender.tab?.id;
        const instanceId = msg.tabInstanceId || "";
        const tabIdentifier =
          rawTabId !== undefined
            ? String(rawTabId)
            : instanceId;

        const data = (await browser.storage.local.get([
          "activeVisits",
          "sessionSiteUsage",
          "domainSpans",
          "isActive",
        ])) as BackgroundData;

        if (!data.isActive) return { success: true };

        const activeVisits = { ...(data.activeVisits ?? {}) };
        const usage = { ...(data.sessionSiteUsage ?? {}) };
        const domainSpans = { ...(data.domainSpans ?? {}) };

        // Check if tab is already closed in browser
        let isTabStillOpen = false;
        if (rawTabId !== undefined) {
          try {
            const tab = await browser.tabs.get(rawTabId);
            isTabStillOpen = Boolean(tab);
          } catch {
            isTabStillOpen = false;
          }
        }

        let changed = false;
        if (!isTabStillOpen) {
          // Tab is closed, finalize immediately
          if (tabIdentifier) {
            const c1 = finalizeVisit(activeVisits, domainSpans, usage, tabIdentifier, now);
            if (c1) changed = true;
          }
          if (instanceId && instanceId !== tabIdentifier) {
            const c2 = finalizeVisit(activeVisits, domainSpans, usage, instanceId, now);
            if (c2) changed = true;
          }
        } else {
          // Tab is still open (reloading or navigating) - update heartbeat so reload can continue seamlessly
          for (const [key, visit] of Object.entries(activeVisits)) {
            if (
              key === tabIdentifier ||
              visit.instanceId === tabIdentifier ||
              (visit.tabId !== undefined && String(visit.tabId) === tabIdentifier)
            ) {
              visit.lastHeartbeat = now;
            }
          }
        }

        // Clean up any domain spans that have no remaining visits
        for (const [domain, span] of Object.entries(domainSpans)) {
          const hasActiveVisit = Object.values(activeVisits).some(
            (v) => v.domain === domain
          );
          if (!hasActiveVisit) {
            const effectiveHeartbeat = span.lastHeartbeat || now;
            const endTime = Math.max(span.startedAt, Math.min(now, effectiveHeartbeat));
            const duration = Math.max(0, endTime - span.startedAt);
            if (duration > 0) {
              usage[domain] = (usage[domain] ?? 0) + duration;
            }
            delete domainSpans[domain];
            changed = true;
          }
        }

        if (changed) {
          await browser.storage.local.set({
            activeVisits,
            sessionSiteUsage: usage,
            domainSpans,
          });
        }

        return { success: true };
      }

      // 5. GET SITE USAGE (BACKWARD COMPATIBILITY)
      if (msg.message === "get_site_usage") {
        const host = normalizeHost(msg.hostname ?? "");
        const data = (await browser.storage.local.get([
          "restrictedSites",
          "sessionSiteUsage",
          "domainSpans",
        ])) as BackgroundData;

        const restrictedSites = data.restrictedSites ?? [];
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
    const candidateUrl = changeInfo.url || tab.url;
    if (!candidateUrl) return;

    const topHost = safeExtractHost(candidateUrl);
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
      const visitKey = Object.keys(activeVisits).find(
        (k) => k === tabKey || activeVisits[k]?.tabId === tabId
      );
      if (!visitKey) return;
      const visit = activeVisits[visitKey];
      if (!visit) return;

      const restrictedSites = data.restrictedSites ?? [];
      const newDomain = findMatchingSite(topHost, restrictedSites);

      // If the tab navigated away to another domain or unrestricted site, finalize its visit
      if (newDomain !== visit.domain) {
        const usage = { ...(data.sessionSiteUsage ?? {}) };
        const domainSpans = { ...(data.domainSpans ?? {}) };

        const changed = finalizeVisit(
          activeVisits,
          domainSpans,
          usage,
          visitKey,
          Date.now(),
        );

        if (changed) {
          await browser.storage.local.set({
            activeVisits,
            sessionSiteUsage: usage,
            domainSpans,
          });
        }
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

      if (!data.isActive) return;

      const tabKey = String(tabId);
      const activeVisits = { ...(data.activeVisits ?? {}) };
      const usage = { ...(data.sessionSiteUsage ?? {}) };
      const domainSpans = { ...(data.domainSpans ?? {}) };
      const now = Date.now();

      let changed = finalizeVisit(
        activeVisits,
        domainSpans,
        usage,
        tabKey,
        now,
      );

      // Reconcile with currently open browser tabs to guarantee no orphaned visits or spans
      try {
        const openTabs = await browser.tabs.query({});
        const openTabIds = new Set(openTabs.map((t) => String(t.id)));

        for (const [key, visit] of Object.entries(activeVisits)) {
          const vTabId = visit.tabId !== undefined ? String(visit.tabId) : key;
          if (!openTabIds.has(vTabId)) {
            const closed = finalizeVisit(activeVisits, domainSpans, usage, key, now);
            if (closed) changed = true;
          }
        }

        // Clean up any domain spans that have no remaining open tabs on that domain
        for (const [domain, span] of Object.entries(domainSpans)) {
          const hasActiveVisit = Object.values(activeVisits).some(
            (v) => v.domain === domain
          );
          if (!hasActiveVisit) {
            const effectiveHeartbeat = span.lastHeartbeat || now;
            const endTime = Math.max(span.startedAt, Math.min(now, effectiveHeartbeat));
            const duration = Math.max(0, endTime - span.startedAt);
            if (duration > 0) {
              usage[domain] = (usage[domain] ?? 0) + duration;
            }
            delete domainSpans[domain];
            changed = true;
          }
        }
      } catch (err) {
        console.warn("Reconcile error in onRemoved:", err);
      }

      if (changed) {
        await browser.storage.local.set({
          activeVisits,
          sessionSiteUsage: usage,
          domainSpans,
        });
      }
    }),
  );
});