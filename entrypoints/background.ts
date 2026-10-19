// Nudge Background Service Worker (Manifest V3)
interface Message {
  message: string;
  mode?: string;
  hostname?: string;
  tabInstanceId?: string;
  tabVisitStartedAt?: number;
  isVisible?: boolean;
}

interface ActiveVisit {
  domain: string;
  hostname: string;
  startedAt: number;
  lastHeartbeat: number;
  tabId?: number;
  instanceId?: string;
  isVisible?: boolean;
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
export const HEARTBEAT_TIMEOUT_MS = 60000;

export function normalizeHost(host: string): string {
  if (!host) return "";
  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .trim();
}

export function findMatchingSite(hostname: string, sites: string[]): string | null {
  const host = normalizeHost(hostname);
  if (!host) return null;

  const normalizedSites = sites.map((s) => normalizeHost(s)).filter(Boolean);
  const configuredTwitterAlias = normalizedSites.find((s) => s === "twitter.com" || s === "x.com");

  for (const domain of normalizedSites) {
    if (!domain) continue;
    if (host === domain || host.endsWith(`.${domain}`)) {
      // If matching twitter or x, normalize to the primary configured alias
      if ((domain === "twitter.com" || domain === "x.com") && configuredTwitterAlias) {
        return configuredTwitterAlias;
      }
      return domain;
    }
  }

  // Cross-alias resolution: resolve rebrand aliases to the canonical configured entry
  if (configuredTwitterAlias) {
    if (host === "twitter.com" || host.endsWith(".twitter.com") || host === "x.com" || host.endsWith(".x.com")) {
      return configuredTwitterAlias;
    }
  }

  return null;
}

export function safeExtractHost(urlStr?: string): string | null {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    return normalizeHost(parsed.hostname);
  } catch {
    return null;
  }
}

export function extractOpenDomains(
  tabs?: Array<{ url?: string; pendingUrl?: string; id?: number }>,
  sites?: string[],
): Set<string> {
  const domains = new Set<string>();
  if (!Array.isArray(tabs) || !Array.isArray(sites)) return domains;
  for (const tab of tabs) {
    const host = safeExtractHost(tab.url) || safeExtractHost(tab.pendingUrl);
    if (host) {
      const match = findMatchingSite(host, sites);
      if (match) {
        domains.add(match);
      }
    }
  }
  return domains;
}

export function isVisitEligible(
  visit: ActiveVisit,
  now: number,
  openTabIds?: Set<string>,
): boolean {
  // An open browser tab remains eligible even if Chrome throttled its heartbeat.
  if (visit.tabId !== undefined && openTabIds) {
    return openTabIds.has(String(visit.tabId));
  }
  if (visit.tabId !== undefined && !openTabIds) {
    // Without an open-tab snapshot, keep the visit if heartbeat is recent.
    return now - visit.lastHeartbeat <= HEARTBEAT_TIMEOUT_MS;
  }
  return now - visit.lastHeartbeat <= HEARTBEAT_TIMEOUT_MS;
}

export function hasEligibleVisitForDomain(
  activeVisits: Record<string, ActiveVisit>,
  domain: string,
  now: number,
  openTabIds?: Set<string>,
  openDomains?: Set<string>,
): boolean {
  if (openDomains && openDomains.has(domain)) {
    return true;
  }
  return Object.values(activeVisits).some(
    (v) => v.domain === domain && isVisitEligible(v, now, openTabIds),
  );
}

export function finalizeDomainSpan(
  domainSpans: Record<string, DomainSpan>,
  usage: Record<string, number>,
  domain: string,
  now: number,
  fallbackTime?: number,
  sessionStart?: number,
): boolean {
  const span = domainSpans[domain];
  if (!span) return false;
  // If fallbackTime is provided (e.g. during startup cleanup or orphan sweep), use it as the end time.
  // Otherwise, the interval ended cleanly at 'now' (e.g. normal tab close, navigation, or session stop).
  const endTime =
    fallbackTime !== undefined ? Math.max(span.startedAt, fallbackTime) : now;
  const effectiveStart =
    sessionStart && sessionStart > 0
      ? Math.max(span.startedAt, sessionStart)
      : span.startedAt;
  const duration = Math.max(0, endTime - effectiveStart);
  if (duration > 0) {
    usage[domain] = (usage[domain] ?? 0) + duration;
  }
  delete domainSpans[domain];
  return true;
}

export function finalizeVisit(
  activeVisits: Record<string, ActiveVisit>,
  domainSpans: Record<string, DomainSpan>,
  usage: Record<string, number>,
  tabIdentifier: string,
  now: number,
  openTabIds?: Set<string>,
  sessionStart?: number,
  openDomains?: Set<string>,
): boolean {
  if (!tabIdentifier) return false;
  let changed = false;
  const domainsToRecheck = new Set<string>();

  for (const [key, visit] of Object.entries(activeVisits)) {
    if (
      key === tabIdentifier ||
      visit.instanceId === tabIdentifier ||
      (visit.tabId !== undefined && String(visit.tabId) === tabIdentifier)
    ) {
      domainsToRecheck.add(visit.domain);
      delete activeVisits[key];
      changed = true;
    }
  }

  for (const domain of domainsToRecheck) {
    const span = domainSpans[domain];
    if (span) {
      // Authoritative condition: does any eligible visit remain for this domain?
      const remainingVisitsForDomain = hasEligibleVisitForDomain(
        activeVisits,
        domain,
        now,
        openTabIds,
        openDomains,
      );

      if (!remainingVisitsForDomain) {
        finalizeDomainSpan(
          domainSpans,
          usage,
          domain,
          now,
          undefined,
          sessionStart,
        );
        changed = true;
      } else {
        // Keep tabKeys synchronized with remaining eligible visits
        span.tabKeys = Object.keys(activeVisits).filter((k) => {
          const v = activeVisits[k];
          return (
            v !== undefined &&
            v.domain === domain &&
            isVisitEligible(v, now, openTabIds)
          );
        });
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
        const restrictedSites = data.restrictedSites ?? [];
        const openDomains = extractOpenDomains(openTabs, restrictedSites);
        const activeVisits = { ...(data.activeVisits ?? {}) };
        const usage = { ...(data.sessionSiteUsage ?? {}) };
        const domainSpans = { ...(data.domainSpans ?? {}) };
        const now = Date.now();
        let changed = false;

        for (const [tabKey, visit] of Object.entries(activeVisits)) {
          const tabIdStr = visit.tabId !== undefined ? String(visit.tabId) : tabKey;
          if (!openTabIds.has(tabIdStr)) {
            finalizeVisit(
              activeVisits,
              domainSpans,
              usage,
              tabKey,
              visit.lastHeartbeat || now,
              openTabIds,
              undefined,
              openDomains,
            );
            changed = true;
          }
        }

        for (const [domain, span] of Object.entries(domainSpans)) {
          if (!hasEligibleVisitForDomain(activeVisits, domain, now, openTabIds, openDomains)) {
            finalizeDomainSpan(domainSpans, usage, domain, now, span.lastHeartbeat);
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

        // Finalize all active domain spans once into accumulated usage
        for (const domain of Object.keys(domainSpans)) {
          finalizeDomainSpan(
            domainSpans,
            usage,
            domain,
            now,
            now,
            data.startedAt,
          );
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
            domainSpanStartedAt: 0,
            baseSiteUsage: 0,
            baseSiteUsageMs: 0,
            baseSiteUsageSec: 0,
            totalSiteUsageSec: 0,
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
          data.mode === "restrict" ? findMatchingSite(host, restrictedSites) : null;

        if (blockedDomain) {
          return {
            isActive: true,
            mode: data.mode ?? "",
            sessionStartedAt: sessionStart,
            isBlocked: true,
            isRestricted: false,
            visitStartedAt: 0,
            domainStartedAt: 0,
            domainSpanStartedAt: 0,
            baseSiteUsage: 0,
            baseSiteUsageMs: 0,
            baseSiteUsageSec: 0,
            totalSiteUsageSec: 0,
          };
        }

        const activeVisits = { ...(data.activeVisits ?? {}) };
        const usage = { ...(data.sessionSiteUsage ?? {}) };
        const domainSpans = { ...(data.domainSpans ?? {}) };
        const rawTabId = sender.tab?.id;
        const instanceId = msg.tabInstanceId || "";
        const isVisible = msg.isVisible !== false;
        const tabKey =
          rawTabId !== undefined
            ? String(rawTabId)
            : (instanceId || (host ? `tab_${host}` : "main_tab"));
        let hasStateChange = false;

        // Prevent ghost visits: if native rawTabId is known, purge any temporary unmapped visit keyed under instanceId
        if (rawTabId !== undefined && instanceId) {
          for (const [k, v] of Object.entries(activeVisits)) {
            if (k !== tabKey && (k === instanceId || v.tabId === undefined) && v.instanceId === instanceId) {
              delete activeVisits[k];
              hasStateChange = true;
            }
          }
        }

        // Reconcile with currently open browser tabs: if tab is closed in browser, finalize immediately
        let openTabIds = new Set<string>();
        let openDomains = new Set<string>();
        try {
          const openTabs = await browser.tabs.query({});
          openTabIds = new Set(openTabs.map((t) => String(t.id)));
          openDomains = extractOpenDomains(openTabs, restrictedSites);

          // If the sender tab was already closed in Chrome before this message processed, do not register a ghost visit
          if (rawTabId !== undefined && openTabIds.size > 0 && !openTabIds.has(String(rawTabId))) {
            return {
              isActive: true,
              mode: data.mode ?? "",
              sessionStartedAt: sessionStart,
              isBlocked: false,
              isRestricted: false,
              visitStartedAt: 0,
              domainStartedAt: 0,
              domainSpanStartedAt: 0,
              baseSiteUsage: 0,
              baseSiteUsageMs: 0,
              baseSiteUsageSec: 0,
              totalSiteUsageSec: 0,
            };
          }

          for (const [k, v] of Object.entries(activeVisits)) {
            const vTabId = v.tabId !== undefined ? String(v.tabId) : k;
            if (k !== tabKey && v.tabId !== undefined && !openTabIds.has(vTabId)) {
              finalizeVisit(
                activeVisits,
                domainSpans,
                usage,
                k,
                v.lastHeartbeat || now,
                openTabIds,
                sessionStart,
                openDomains,
              );
              hasStateChange = true;
            }
          }
        } catch {}

        // Prune only closed / non-tab visits with stale heartbeats.
        // Open tabs remain eligible even when Chrome throttles background timers.
        for (const [k, v] of Object.entries(activeVisits)) {
          if (k === tabKey) continue;
          const vTabId = v.tabId !== undefined ? String(v.tabId) : k;
          const isOpenTab = v.tabId !== undefined && openTabIds.has(vTabId);
          if (!isOpenTab && now - v.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
            finalizeVisit(
              activeVisits,
              domainSpans,
              usage,
              k,
              v.lastHeartbeat || now,
              openTabIds,
              sessionStart,
              openDomains,
            );
            hasStateChange = true;
          } else if (isOpenTab && now - v.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
            if (v.isVisible) {
              v.isVisible = false;
              hasStateChange = true;
            }
          }
        }

        // Domain spans stay open while any eligible tab of the domain remains open
        for (const [domain, span] of Object.entries(domainSpans)) {
          if (!hasEligibleVisitForDomain(activeVisits, domain, now, openTabIds, openDomains)) {
            finalizeDomainSpan(
              domainSpans,
              usage,
              domain,
              now,
              span.lastHeartbeat,
              sessionStart,
            );
            hasStateChange = true;
          }
        }

        let existing = activeVisits[tabKey];

        // Drop visit anchors from a prior session (do not count pre-session time)
        if (existing && existing.startedAt < sessionStart) {
          delete activeVisits[tabKey];
          existing = undefined;
        }

        // Drop any stale domain span from a prior session (never add stale pre-session state to current session usage)
        if (restrictedDomain) {
          const staleSpan = domainSpans[restrictedDomain];
          if (staleSpan && staleSpan.startedAt < sessionStart) {
            delete domainSpans[restrictedDomain];
            hasStateChange = true;
          }
        }

        // Only finalize the visit if the tab navigated away to a different domain or an unrestricted site
        if (existing && existing.domain !== restrictedDomain) {
          const changed = finalizeVisit(
            activeVisits,
            domainSpans,
            usage,
            tabKey,
            now,
            openTabIds,
            sessionStart,
            openDomains,
          );
          if (changed) hasStateChange = true;
        }

        if (restrictedDomain) {
          // Check if this specific tab was already active on this domain in this session
          const isTabContinuing =
            existing !== undefined &&
            existing.domain === restrictedDomain &&
            existing.startedAt >= sessionStart;

          let currentVisit: ActiveVisit;
          if (!isTabContinuing || !existing) {
            // Finalize prior visit on this tab if it belonged to a different domain
            if (existing) {
              finalizeVisit(
                activeVisits,
                domainSpans,
                usage,
                tabKey,
                existing.lastHeartbeat || now,
                openTabIds,
                sessionStart,
                openDomains,
              );
            }
            // Accept the content script's visit start timestamp if it falls within the current session
            // and was not inherited from an existing sibling tab in sessionStorage.
            const isInheritedFromSibling =
              typeof msg.tabVisitStartedAt === "number" &&
              Object.values(activeVisits).some(
                (v) =>
                  v.startedAt === msg.tabVisitStartedAt &&
                  (rawTabId === undefined || v.tabId !== rawTabId),
              );
            const isValidVisitStart =
              typeof msg.tabVisitStartedAt === "number" &&
              msg.tabVisitStartedAt >= sessionStart &&
              msg.tabVisitStartedAt <= now &&
              !isInheritedFromSibling;
            const visitStart =
              isValidVisitStart && typeof msg.tabVisitStartedAt === "number"
                ? msg.tabVisitStartedAt
                : Math.max(now, sessionStart);
            currentVisit = {
              domain: restrictedDomain,
              hostname: host,
              tabId: rawTabId,
              instanceId,
              startedAt: visitStart,
              lastHeartbeat: now,
              isVisible,
            };
            activeVisits[tabKey] = currentVisit;
            hasStateChange = true;
          } else {
            // Tab is continuing on the same restricted domain (e.g. reload or periodic heartbeat)
            currentVisit = existing;
            currentVisit.lastHeartbeat = now;
            currentVisit.isVisible = isVisible;
            if (instanceId) currentVisit.instanceId = instanceId;
            if (rawTabId !== undefined && currentVisit.tabId === undefined) {
              currentVisit.tabId = rawTabId;
              hasStateChange = true;
            }
          }

          // Shared domain span: one timeline while any eligible tab of this domain is open
          // (foreground or background). Visibility must not start/stop this clock.
          let span = domainSpans[restrictedDomain];
          if (!span) {
            // When no live domain span exists, opening this domain starts a fresh span.
            // If base usage already accumulated from prior visits in this session,
            // we must anchor the new span to max(now, sessionStart), NOT backdate to currentVisit.startedAt
            // across time already committed to sessionSiteUsage!
            const initialSpanStart =
              (usage[restrictedDomain] ?? 0) > 0
                ? Math.max(now, sessionStart)
                : Math.max(sessionStart, currentVisit.startedAt);
            span = {
              startedAt: initialSpanStart,
              tabKeys: [tabKey],
              lastHeartbeat: now,
            };
            domainSpans[restrictedDomain] = span;
            hasStateChange = true;
          } else {
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

          const snapshotNow = Date.now();
          currentVisit.lastHeartbeat = snapshotNow;
          span.lastHeartbeat = snapshotNow;

          const effectiveSpanStart = Math.max(span.startedAt, sessionStart);
          const activeDuration = Math.max(0, snapshotNow - effectiveSpanStart);
          const rawTotalDuration = (usage[restrictedDomain] ?? 0) + activeDuration;
          const maxSessionMs = Math.max(0, snapshotNow - sessionStart);
          const totalDurationMs = Math.min(maxSessionMs, rawTotalDuration);

          const totalSiteUsageSec = Math.floor(totalDurationMs / 1000);
          // Confirm snapshot timestamp and usage value refer to the exact same instant:
          // the precise millisecond when the domain reached totalSiteUsageSec whole seconds.
          const usageSnapshotAt = snapshotNow - (totalDurationMs % 1000);

          return {
            isActive: true,
            mode: data.mode ?? "",
            sessionStartedAt: sessionStart,
            isBlocked: false,
            isRestricted: true,
            domain: restrictedDomain,
            tabId: rawTabId,
            visitStartedAt: currentVisit.startedAt,
            // Never substitute a per-tab visit start for a missing shared span
            domainSpanStartedAt: span.startedAt,
            domainStartedAt: span.startedAt,
            baseSiteUsage: usage[restrictedDomain] ?? 0,
            baseSiteUsageMs: usage[restrictedDomain] ?? 0,
            baseSiteUsageSec: Math.floor((usage[restrictedDomain] ?? 0) / 1000),
            totalSiteUsageSec,
            totalSiteUsageMs: totalDurationMs,
            usageSnapshotAt,
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
          domainSpanStartedAt: 0,
          baseSiteUsage: 0,
          baseSiteUsageMs: 0,
          baseSiteUsageSec: 0,
          totalSiteUsageSec: 0,
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
          "startedAt",
          "restrictedSites",
        ])) as BackgroundData;

        if (!data.isActive) return { success: true };

        const activeVisits = { ...(data.activeVisits ?? {}) };
        const usage = { ...(data.sessionSiteUsage ?? {}) };
        const domainSpans = { ...(data.domainSpans ?? {}) };
        const sessionStart = data.startedAt && data.startedAt > 0 ? data.startedAt : now;

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
        let openTabIds: Set<string> | undefined;
        let openDomains: Set<string> | undefined;
        try {
          const openTabs = await browser.tabs.query({});
          openTabIds = new Set(openTabs.map((t) => String(t.id)));
          const restrictedSites = data.restrictedSites ?? [];
          openDomains = extractOpenDomains(openTabs, restrictedSites);
        } catch {}

        if (!isTabStillOpen) {
          // Tab is closed, finalize immediately
          if (tabIdentifier) {
            const c1 = finalizeVisit(
              activeVisits,
              domainSpans,
              usage,
              tabIdentifier,
              now,
              openTabIds,
              sessionStart,
              openDomains,
            );
            if (c1) changed = true;
          }
        } else {
          // Tab is still open (reloading or navigating) - update heartbeat so reload can continue seamlessly
          for (const [key, visit] of Object.entries(activeVisits)) {
            if (
              key === tabIdentifier ||
              (visit.tabId !== undefined && String(visit.tabId) === tabIdentifier)
            ) {
              visit.lastHeartbeat = now;
            }
          }
        }

        // Clean up any domain spans that have no remaining eligible open tabs
        for (const [domain, span] of Object.entries(domainSpans)) {
          if (!hasEligibleVisitForDomain(activeVisits, domain, now, openTabIds, openDomains)) {
            finalizeDomainSpan(
              domainSpans,
              usage,
              domain,
              now,
              span.lastHeartbeat,
              sessionStart,
            );
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

    // Distinguish transient navigation states (about:blank, empty/missing host) from confirmed navigations
    const topHost = safeExtractHost(candidateUrl);
    if (!topHost) return;

    runSerial(async () => {
      const data = (await browser.storage.local.get([
        "activeVisits",
        "sessionSiteUsage",
        "domainSpans",
        "restrictedSites",
        "isActive",
        "startedAt",
      ])) as BackgroundData;

      if (!data.isActive) return;

      const tabKey = String(tabId);
      const activeVisits = { ...(data.activeVisits ?? {}) };
      const visitKey = Object.keys(activeVisits).find(
        (k) => k === tabKey || activeVisits[k]?.tabId === tabId,
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
        const now = Date.now();
        const sessionStart =
          data.startedAt && data.startedAt > 0 ? data.startedAt : now;

        let openTabIds: Set<string> | undefined;
        let openDomains: Set<string> | undefined;
        try {
          const openTabs = await browser.tabs.query({});
          openTabIds = new Set(openTabs.map((t) => String(t.id)));
          openDomains = extractOpenDomains(openTabs, restrictedSites);
        } catch {}

        const changed = finalizeVisit(
          activeVisits,
          domainSpans,
          usage,
          visitKey,
          now,
          openTabIds,
          sessionStart,
          openDomains,
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
        "startedAt",
        "restrictedSites",
      ])) as BackgroundData;

      if (!data.isActive) return;

      const tabKey = String(tabId);
      const activeVisits = { ...(data.activeVisits ?? {}) };
      const usage = { ...(data.sessionSiteUsage ?? {}) };
      const domainSpans = { ...(data.domainSpans ?? {}) };
      const now = Date.now();
      const sessionStart = data.startedAt && data.startedAt > 0 ? data.startedAt : now;

      let openTabIds = new Set<string>();
      let openDomains = new Set<string>();
      try {
        const openTabs = await browser.tabs.query({});
        openTabIds = new Set(openTabs.map((t) => String(t.id)));
        const restrictedSites = data.restrictedSites ?? [];
        openDomains = extractOpenDomains(openTabs, restrictedSites);
      } catch {}

      let changed = finalizeVisit(
        activeVisits,
        domainSpans,
        usage,
        tabKey,
        now,
        openTabIds,
        sessionStart,
        openDomains,
      );

      // Reconcile with currently open browser tabs to guarantee no orphaned visits or spans
      try {
        for (const [key, visit] of Object.entries(activeVisits)) {
          if (visit.tabId !== undefined) {
            if (!openTabIds.has(String(visit.tabId))) {
              const closed = finalizeVisit(
                activeVisits,
                domainSpans,
                usage,
                key,
                now,
                openTabIds,
                sessionStart,
                openDomains,
              );
              if (closed) changed = true;
            }
          } else {
            // For unmapped visits, only prune if heartbeat is timed out
            if (now - visit.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
              const closed = finalizeVisit(
                activeVisits,
                domainSpans,
                usage,
                key,
                now,
                openTabIds,
                sessionStart,
                openDomains,
              );
              if (closed) changed = true;
            }
          }
        }

        for (const [domain, span] of Object.entries(domainSpans)) {
          if (!hasEligibleVisitForDomain(activeVisits, domain, now, openTabIds, openDomains)) {
            finalizeDomainSpan(
              domainSpans,
              usage,
              domain,
              now,
              span.lastHeartbeat,
              sessionStart,
            );
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

  // Track focus flags only — do NOT start/stop shared domain spans on tab switch.
  // Domain usage continues while any eligible tab of the domain remains open.
  browser.tabs.onActivated.addListener((activeInfo) =>
    runSerial(async () => {
      const data = (await browser.storage.local.get([
        "activeVisits",
        "isActive",
      ])) as BackgroundData;

      if (!data.isActive) return;

      const activeVisits = { ...(data.activeVisits ?? {}) };
      const now = Date.now();
      let changed = false;
      const activatedTabKey = String(activeInfo.tabId);

      for (const [key, visit] of Object.entries(activeVisits)) {
        const isThisTab = key === activatedTabKey || visit.tabId === activeInfo.tabId;
        if (isThisTab) {
          if (!visit.isVisible) {
            visit.isVisible = true;
            visit.lastHeartbeat = now;
            changed = true;
          }
        } else if (visit.isVisible) {
          visit.isVisible = false;
          changed = true;
        }
      }

      if (changed) {
        await browser.storage.local.set({ activeVisits });
      }
    }),
  );

  // CLEAN UP VISITS AND SPANS WHEN A SITE IS UNRESTRICTED
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const restrictedSitesChange = changes.restrictedSites;
    if (restrictedSitesChange) {
      void runSerial(async () => {
        const data = (await browser.storage.local.get([
          "activeVisits",
          "sessionSiteUsage",
          "domainSpans",
          "isActive",
          "startedAt",
        ])) as BackgroundData;

        if (!data.isActive) return;

        const newRestrictedSites: string[] = Array.isArray(restrictedSitesChange.newValue)
          ? (restrictedSitesChange.newValue as string[])
          : [];

        const activeVisits = { ...(data.activeVisits ?? {}) };
        const usage = { ...(data.sessionSiteUsage ?? {}) };
        const domainSpans = { ...(data.domainSpans ?? {}) };
        const now = Date.now();
        const sessionStart = data.startedAt && data.startedAt > 0 ? data.startedAt : now;
        let changed = false;

        // Finalize visits for domains no longer in restrictedSites
        for (const [key, visit] of Object.entries(activeVisits)) {
          const matched = findMatchingSite(visit.domain, newRestrictedSites);
          if (!matched) {
            finalizeVisit(activeVisits, domainSpans, usage, key, now);
            changed = true;
          }
        }

        // Finalize domain spans for domains no longer in restrictedSites
        for (const [domain, span] of Object.entries(domainSpans)) {
          const matched = findMatchingSite(domain, newRestrictedSites);
          if (!matched) {
            finalizeDomainSpan(domainSpans, usage, domain, now, now, sessionStart);
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
      });
    }
  });
});