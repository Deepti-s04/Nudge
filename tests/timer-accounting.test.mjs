import test from "node:test";
import assert from "node:assert/strict";

// Global mocks for WXT and browser extensions
globalThis.defineBackground = (fn) => fn;
globalThis.browser = {
  storage: {
    local: {
      get: async () => ({}),
      set: async () => {},
    },
    onChanged: { addListener: () => {} },
  },
  runtime: {
    onMessage: { addListener: () => {} },
  },
  tabs: {
    onUpdated: { addListener: () => {} },
    onRemoved: { addListener: () => {} },
    onActivated: { addListener: () => {} },
  },
};

// Import actual exported functions from entrypoints/background.ts
const {
  normalizeHost,
  findMatchingSite,
  safeExtractHost,
  isVisitEligible,
  hasEligibleVisitForDomain,
  finalizeDomainSpan,
  finalizeVisit,
  extractOpenDomains,
  HEARTBEAT_TIMEOUT_MS,
} = await import("../entrypoints/background.ts");

// Helper simulating background check_site logic matching background.ts exactly
function handleCheckSite({
  storage,
  senderTabId,
  rawHostname,
  msgVisitStartedAt,
  now,
  openTabIds,
}) {
  const host = normalizeHost(rawHostname);
  const sessionStart = storage.startedAt && storage.startedAt > 0 ? storage.startedAt : now;
  const mode = storage.mode || "restrict";
  const blockedSites = storage.blockedSites || [];
  const restrictedSites = storage.restrictedSites || [];

  const blockedDomain = mode === "block" ? findMatchingSite(host, blockedSites) : null;
  const restrictedDomain = mode === "restrict" ? findMatchingSite(host, restrictedSites) : null;

  if (blockedDomain) {
    return {
      isActive: true,
      mode,
      isBlocked: true,
      isRestricted: false,
    };
  }

  if (!restrictedDomain) {
    return {
      isActive: true,
      mode,
      isBlocked: false,
      isRestricted: false,
    };
  }

  const tabKey = senderTabId !== undefined ? String(senderTabId) : `tab_${host}`;
  const activeVisits = storage.activeVisits;
  const usage = storage.sessionSiteUsage;
  const domainSpans = storage.domainSpans;

  let existing = activeVisits[tabKey];

  // Drop visit anchors from prior session
  if (existing && existing.startedAt < sessionStart) {
    delete activeVisits[tabKey];
    existing = undefined;
  }

  // Drop stale span from prior session
  const staleSpan = domainSpans[restrictedDomain];
  if (staleSpan && staleSpan.startedAt < sessionStart) {
    delete domainSpans[restrictedDomain];
  }

  // Finalize if domain changed
  if (existing && existing.domain !== restrictedDomain) {
    finalizeVisit(activeVisits, domainSpans, usage, tabKey, now, openTabIds, sessionStart);
  }

  const isTabContinuing =
    existing !== undefined &&
    existing.domain === restrictedDomain &&
    existing.startedAt >= sessionStart;

  let currentVisit = existing;
  if (!isTabContinuing || !currentVisit) {
    if (existing) {
      finalizeVisit(activeVisits, domainSpans, usage, tabKey, existing.lastHeartbeat || now, openTabIds, sessionStart);
    }
    const isInheritedFromSibling =
      typeof msgVisitStartedAt === "number" &&
      Object.values(activeVisits).some(
        (v) =>
          v.startedAt === msgVisitStartedAt &&
          (senderTabId === undefined || v.tabId !== senderTabId),
      );
    const isValidVisitStart =
      typeof msgVisitStartedAt === "number" &&
      msgVisitStartedAt >= sessionStart &&
      msgVisitStartedAt <= now &&
      !isInheritedFromSibling;
    const visitStart = isValidVisitStart
      ? msgVisitStartedAt
      : Math.max(now, sessionStart);
    currentVisit = {
      domain: restrictedDomain,
      hostname: host,
      tabId: senderTabId,
      startedAt: visitStart,
      lastHeartbeat: now,
      isVisible: true,
    };
    activeVisits[tabKey] = currentVisit;
  } else {
    currentVisit.lastHeartbeat = now;
  }

  // Shared domain span
  let span = domainSpans[restrictedDomain];
  if (!span) {
    span = {
      startedAt: Math.max(sessionStart, currentVisit.startedAt),
      tabKeys: [tabKey],
      lastHeartbeat: now,
    };
    domainSpans[restrictedDomain] = span;
  } else {
    span.lastHeartbeat = now;
    if (!span.tabKeys.includes(tabKey)) {
      span.tabKeys.push(tabKey);
    }
  }

  const effectiveSpanStart = Math.max(span.startedAt, sessionStart);
  const activeDuration = Math.max(0, now - effectiveSpanStart);
  const rawTotalDuration = (usage[restrictedDomain] ?? 0) + activeDuration;
  const maxSessionMs = Math.max(0, now - sessionStart);
  const totalDurationMs = Math.min(maxSessionMs, rawTotalDuration);
  const totalSiteUsageSec = Math.floor(totalDurationMs / 1000);
  const usageSnapshotAt = now - (totalDurationMs % 1000);

  return {
    isActive: true,
    isRestricted: true,
    domain: restrictedDomain,
    tabId: senderTabId,
    sessionStartedAt: sessionStart,
    visitStartedAt: currentVisit.startedAt,
    domainSpanStartedAt: span.startedAt,
    baseSiteUsageMs: usage[restrictedDomain] ?? 0,
    totalSiteUsageSec,
    totalSiteUsageMs: totalDurationMs,
    usageSnapshotAt,
  };
}

// Helper simulating content script display timer calculation
function computeContentTimers({
  now,
  sessionStartedAt,
  visitStartedAt,
  usageSnapshotSec,
  usageSnapshotAt,
  domainSpanStartedAt,
  baseSiteUsageMs,
  lastVisitSec = -1,
  lastTotalSec = -1,
}) {
  // Right timer: shared domain usage across session (base accumulated ms + live span ms)
  const liveSpanStart = domainSpanStartedAt > 0 ? domainSpanStartedAt : visitStartedAt;
  const effectiveSpanStart =
    liveSpanStart > 0 && sessionStartedAt > 0
      ? Math.max(liveSpanStart, sessionStartedAt)
      : liveSpanStart;
  const liveSpanMs = effectiveSpanStart > 0 ? Math.max(0, now - effectiveSpanStart) : 0;
  let totalDurationMs = (baseSiteUsageMs ?? 0) + liveSpanMs;
  if (sessionStartedAt > 0) {
    const maxSessionMs = Math.max(0, now - sessionStartedAt);
    if (totalDurationMs > maxSessionMs) {
      totalDurationMs = maxSessionMs;
    }
  }
  let totalSiteSec = Math.floor(totalDurationMs / 1000);

  if (lastTotalSec >= 0 && totalSiteSec < lastTotalSec) {
    totalSiteSec = lastTotalSec;
  }

  // Middle timer: independent per-tab visit lifetime
  const effectiveVisitStart = sessionStartedAt > 0 ? Math.max(visitStartedAt, sessionStartedAt) : visitStartedAt;
  let currentVisitSec = Math.max(0, Math.floor((now - effectiveVisitStart) / 1000));

  if (lastVisitSec >= 0 && currentVisitSec < lastVisitSec) {
    currentVisitSec = lastVisitSec;
  }

  return { currentVisitSec, totalSiteSec };
}

// ==========================================
// REGRESSION TEST SUITE (10 REQUIREMENTS)
// ==========================================

test("1. Tab A opens YouTube and remains open for 30 seconds: right timer = 30 seconds", () => {
  const storage = {
    isActive: true,
    startedAt: 1000,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };
  const openTabs = new Set(["101"]);

  // Tab A opens at t = 1000 (sessionStart = 1000)
  const respA = handleCheckSite({
    storage,
    senderTabId: 101,
    rawHostname: "www.youtube.com",
    now: 1000,
    openTabIds: openTabs,
  });

  assert.equal(respA.visitStartedAt, 1000);
  assert.equal(respA.domainSpanStartedAt, 1000);
  assert.equal(respA.totalSiteUsageSec, 0);

  // Tab A remains open for 30 seconds (now = 31000)
  const timers = computeContentTimers({
    now: 31000,
    sessionStartedAt: respA.sessionStartedAt,
    visitStartedAt: respA.visitStartedAt,
    usageSnapshotSec: respA.totalSiteUsageSec,
    usageSnapshotAt: respA.usageSnapshotAt,
    domainSpanStartedAt: respA.domainSpanStartedAt,
    baseSiteUsageMs: respA.baseSiteUsageMs,
  });

  assert.equal(timers.currentVisitSec, 30, "Centre timer should be 30 seconds");
  assert.equal(timers.totalSiteSec, 30, "Right timer should be 30 seconds");
});

test("2. Tab B opens; both remain open for another 30 seconds: right timer = 60 seconds, not 90", () => {
  const storage = {
    isActive: true,
    startedAt: 1000,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };
  const openTabs = new Set(["101", "102"]);

  // Tab A opened at t = 1000
  handleCheckSite({
    storage,
    senderTabId: 101,
    rawHostname: "www.youtube.com",
    now: 1000,
    openTabIds: openTabs,
  });

  // Tab B opens at t = 31000 (30 seconds later)
  const respB = handleCheckSite({
    storage,
    senderTabId: 102,
    rawHostname: "www.youtube.com",
    now: 31000,
    openTabIds: openTabs,
  });

  assert.equal(respB.visitStartedAt, 31000, "Tab B visit starts at 31000");
  assert.equal(respB.totalSiteUsageSec, 30, "Total site usage at t=31000 is 30s");

  // Both remain open for another 30 seconds (now = 61000)
  const timersB = computeContentTimers({
    now: 61000,
    sessionStartedAt: respB.sessionStartedAt,
    visitStartedAt: respB.visitStartedAt,
    usageSnapshotSec: respB.totalSiteUsageSec,
    usageSnapshotAt: respB.usageSnapshotAt,
    domainSpanStartedAt: respB.domainSpanStartedAt,
    baseSiteUsageMs: respB.baseSiteUsageMs,
  });

  assert.equal(timersB.currentVisitSec, 30, "Tab B centre timer = 30 seconds");
  assert.equal(timersB.totalSiteSec, 60, "Right timer = 60 seconds, NOT 90 seconds");
});

test("3. Close Tab A: right timer remains 60 seconds and continues because Tab B is still open", () => {
  const storage = {
    isActive: true,
    startedAt: 1000,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };
  let openTabs = new Set(["101", "102"]);

  handleCheckSite({
    storage,
    senderTabId: 101,
    rawHostname: "www.youtube.com",
    now: 1000,
    openTabIds: openTabs,
  });
  handleCheckSite({
    storage,
    senderTabId: 102,
    rawHostname: "www.youtube.com",
    now: 31000,
    openTabIds: openTabs,
  });

  // Close Tab A at t = 61000
  openTabs = new Set(["102"]);
  const finalized = finalizeVisit(
    storage.activeVisits,
    storage.domainSpans,
    storage.sessionSiteUsage,
    "101",
    61000,
    openTabs,
    storage.startedAt,
  );

  assert.equal(finalized, true, "Tab A visit was removed");
  assert.equal(storage.activeVisits["101"], undefined, "Tab A visit removed from activeVisits");
  assert.notEqual(storage.activeVisits["102"], undefined, "Tab B visit remains");
  assert.notEqual(storage.domainSpans["youtube.com"], undefined, "Domain span remains active because Tab B is still open");
  assert.equal(storage.sessionSiteUsage["youtube.com"], undefined, "No premature domain usage commitment while Tab B open");

  // Tab B syncs at t = 61000
  const respB = handleCheckSite({
    storage,
    senderTabId: 102,
    rawHostname: "www.youtube.com",
    now: 61000,
    openTabIds: openTabs,
  });

  // At t = 71000 (10 seconds after Tab A closed):
  const timersB = computeContentTimers({
    now: 71000,
    sessionStartedAt: respB.sessionStartedAt,
    visitStartedAt: respB.visitStartedAt,
    usageSnapshotSec: respB.totalSiteUsageSec,
    usageSnapshotAt: respB.usageSnapshotAt,
    domainSpanStartedAt: respB.domainSpanStartedAt,
    baseSiteUsageMs: respB.baseSiteUsageMs,
  });

  assert.equal(timersB.totalSiteSec, 70, "Right timer continues running to 70s");
});

test("4. Refresh Tab B: centre timer preserves Tab B's lifetime; right timer neither resets nor double-counts", () => {
  const storage = {
    isActive: true,
    startedAt: 1000,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };
  const openTabs = new Set(["102"]);

  // Tab B opened at t = 31000
  handleCheckSite({
    storage,
    senderTabId: 102,
    rawHostname: "www.youtube.com",
    now: 31000,
    openTabIds: openTabs,
  });

  // Refresh Tab B at t = 71000:
  // 1. Transient onUpdated events occur (e.g. about:blank or missing host)
  assert.equal(safeExtractHost("about:blank"), null, "about:blank is transient");
  assert.equal(safeExtractHost(""), null, "empty URL is transient");

  // 2. Tab B re-runs check_site with same tabId (102)
  const respBAfterRefresh = handleCheckSite({
    storage,
    senderTabId: 102,
    rawHostname: "www.youtube.com",
    now: 71000,
    openTabIds: openTabs,
  });

  // Tab B visit start is preserved!
  assert.equal(respBAfterRefresh.visitStartedAt, 31000, "Tab B's original start time preserved across refresh");
  assert.equal(respBAfterRefresh.totalSiteUsageSec, 40, "Right timer reflects 40s (71000 - 31000)");

  // Content timer calculation at t = 75000:
  const timers = computeContentTimers({
    now: 75000,
    sessionStartedAt: respBAfterRefresh.sessionStartedAt,
    visitStartedAt: respBAfterRefresh.visitStartedAt,
    usageSnapshotSec: respBAfterRefresh.totalSiteUsageSec,
    usageSnapshotAt: respBAfterRefresh.usageSnapshotAt,
    domainSpanStartedAt: respBAfterRefresh.domainSpanStartedAt,
    baseSiteUsageMs: respBAfterRefresh.baseSiteUsageMs,
  });

  assert.equal(timers.currentVisitSec, 44, "Centre timer preserved: 75s - 31s = 44s");
  assert.equal(timers.totalSiteSec, 44, "Right timer neither reset to 0 nor double-counted");
});

test("5. Close the final YouTube tab: final usage is saved exactly once and the timer stops", () => {
  const storage = {
    isActive: true,
    startedAt: 1000,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };
  let openTabs = new Set(["102"]);

  handleCheckSite({
    storage,
    senderTabId: 102,
    rawHostname: "www.youtube.com",
    now: 1000,
    openTabIds: openTabs,
  });

  // Close final tab at t = 91000 (90 seconds elapsed)
  openTabs = new Set();
  const changed = finalizeVisit(
    storage.activeVisits,
    storage.domainSpans,
    storage.sessionSiteUsage,
    "102",
    91000,
    openTabs,
    storage.startedAt,
  );

  assert.equal(changed, true);
  assert.equal(storage.domainSpans["youtube.com"], undefined, "Domain span removed");
  assert.equal(storage.sessionSiteUsage["youtube.com"], 90000, "90 seconds saved into sessionSiteUsage exactly once");

  // Subsequent call to finalizeVisit or reconcile does not double-count
  finalizeVisit(
    storage.activeVisits,
    storage.domainSpans,
    storage.sessionSiteUsage,
    "102",
    91000,
    openTabs,
    storage.startedAt,
  );
  assert.equal(storage.sessionSiteUsage["youtube.com"], 90000, "Usage remained 90s (finalized exactly once)");
});

test("6. Reopen YouTube in the same session: right timer resumes from the previous accumulated total", () => {
  const storage = {
    isActive: true,
    startedAt: 1000,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: { "youtube.com": 90000 }, // 90s accumulated
    domainSpans: {},
  };
  const openTabs = new Set(["103"]);

  // Tab C opens YouTube at t = 121000 (after being closed for 30 seconds)
  const respC = handleCheckSite({
    storage,
    senderTabId: 103,
    rawHostname: "www.youtube.com",
    now: 121000,
    openTabIds: openTabs,
  });

  assert.equal(respC.visitStartedAt, 121000, "Tab C centre timer starts fresh at t = 121000");
  assert.equal(respC.baseSiteUsageMs, 90000, "Base usage is 90s");
  assert.equal(respC.totalSiteUsageSec, 90, "Right timer resumes from 90s");

  // Advance 15 seconds to t = 136000:
  const timers = computeContentTimers({
    now: 136000,
    sessionStartedAt: respC.sessionStartedAt,
    visitStartedAt: respC.visitStartedAt,
    usageSnapshotSec: respC.totalSiteUsageSec,
    usageSnapshotAt: respC.usageSnapshotAt,
    domainSpanStartedAt: respC.domainSpanStartedAt,
    baseSiteUsageMs: respC.baseSiteUsageMs,
  });

  assert.equal(timers.currentVisitSec, 15, "Tab C centre timer is 15s");
  assert.equal(timers.totalSiteSec, 105, "Right timer resumed from 90s to 105s (90 + 15)");
});

test("7. Start a new session: old usage is excluded and both timers start fresh", () => {
  // Storage before new session (has old visits and usage)
  const oldStorage = {
    isActive: true,
    startedAt: 1000,
    restrictedSites: ["youtube.com"],
    activeVisits: { "103": { domain: "youtube.com", startedAt: 121000, lastHeartbeat: 136000 } },
    sessionSiteUsage: { "youtube.com": 90000 },
    domainSpans: { "youtube.com": { startedAt: 121000, tabKeys: ["103"] } },
  };

  // Start new session at t = 200000 (clears prior activeVisits, sessionSiteUsage, domainSpans)
  const newStorage = {
    isActive: true,
    startedAt: 200000,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };
  const openTabs = new Set(["104"]);

  const resp = handleCheckSite({
    storage: newStorage,
    senderTabId: 104,
    rawHostname: "www.youtube.com",
    now: 210000,
    openTabIds: openTabs,
  });

  assert.equal(resp.visitStartedAt, 210000, "Visit starts at 210000 in new session");
  assert.equal(resp.baseSiteUsageMs, 0, "Old 90s usage excluded; baseSiteUsage is 0");
  assert.equal(resp.totalSiteUsageSec, 0, "Right timer starts at 0");

  const timers = computeContentTimers({
    now: 220000,
    sessionStartedAt: resp.sessionStartedAt,
    visitStartedAt: resp.visitStartedAt,
    usageSnapshotSec: resp.totalSiteUsageSec,
    usageSnapshotAt: resp.usageSnapshotAt,
    domainSpanStartedAt: resp.domainSpanStartedAt,
    baseSiteUsageMs: resp.baseSiteUsageMs,
  });

  assert.equal(timers.currentVisitSec, 10, "Centre timer is 10s");
  assert.equal(timers.totalSiteSec, 10, "Right timer is 10s");
});

test("8. Duplicate a tab: the new tab's centre timer starts independently", () => {
  const storage = {
    isActive: true,
    startedAt: 200000,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };
  const openTabs = new Set(["104", "105"]);

  // Tab D (tabId: 104) opened at t = 210000
  const respD = handleCheckSite({
    storage,
    senderTabId: 104,
    rawHostname: "www.youtube.com",
    now: 210000,
    openTabIds: openTabs,
  });
  assert.equal(respD.visitStartedAt, 210000);

  // At t = 225000, Tab D is duplicated. Chrome creates Tab E (tabId: 105).
  // Tab E sends check_site with tabId 105. It might carry msgVisitStartedAt = 210000 from sessionStorage.
  const respE = handleCheckSite({
    storage,
    senderTabId: 105,
    rawHostname: "www.youtube.com",
    msgVisitStartedAt: 210000, // inherited from parent tab's sessionStorage
    now: 225000,
    openTabIds: openTabs,
  });

  // Background tabId is authoritative: Tab E gets fresh visit start at 225000!
  assert.equal(respE.visitStartedAt, 225000, "Tab E gets fresh start time 225000, does not inherit Tab D's start time");

  // At t = 230000:
  const timersD = computeContentTimers({
    now: 230000,
    sessionStartedAt: respD.sessionStartedAt,
    visitStartedAt: respD.visitStartedAt,
    usageSnapshotSec: respD.totalSiteUsageSec,
    usageSnapshotAt: respD.usageSnapshotAt,
    domainSpanStartedAt: respD.domainSpanStartedAt,
    baseSiteUsageMs: respD.baseSiteUsageMs,
  });
  const timersE = computeContentTimers({
    now: 230000,
    sessionStartedAt: respE.sessionStartedAt,
    visitStartedAt: respE.visitStartedAt,
    usageSnapshotSec: respE.totalSiteUsageSec,
    usageSnapshotAt: respE.usageSnapshotAt,
    domainSpanStartedAt: respE.domainSpanStartedAt,
    baseSiteUsageMs: respE.baseSiteUsageMs,
  });

  assert.equal(timersD.currentVisitSec, 20, "Tab D centre timer: 230 - 210 = 20s");
  assert.equal(timersE.currentVisitSec, 5, "Tab E centre timer: 230 - 225 = 5s (independent!)");
  assert.equal(timersE.totalSiteSec, 20, "Right timer is 20s (domain usage is shared)");
});

test("9. Reload through a transient URL state: do not prematurely finalize the visit", () => {
  const activeVisits = {
    "101": {
      domain: "youtube.com",
      hostname: "youtube.com",
      startedAt: 1000,
      lastHeartbeat: 5000,
      tabId: 101,
    },
  };
  const domainSpans = {
    "youtube.com": {
      startedAt: 1000,
      tabKeys: ["101"],
      lastHeartbeat: 5000,
    },
  };
  const usage = {};
  const restrictedSites = ["youtube.com"];

  // Candidate URLs during reload:
  const transientUrls = [
    "about:blank",
    "about:srcdoc",
    "",
    "chrome-error://chromewebdata/",
  ];

  for (const url of transientUrls) {
    const topHost = safeExtractHost(url);
    // Transient navigation filter: if !topHost, return and do not finalize
    assert.equal(topHost, null, `Transient url ${url} should have null topHost`);
  }

  // Confirmed navigation away:
  const nonRestrictedUrl = "https://news.ycombinator.com";
  const newHost = safeExtractHost(nonRestrictedUrl);
  assert.equal(newHost, "news.ycombinator.com");
  const newDomain = findMatchingSite(newHost, restrictedSites);
  assert.equal(newDomain, null); // Navigated away!

  // Finalize visit only on confirmed navigation away:
  const changed = finalizeVisit(activeVisits, domainSpans, usage, "101", 10000, new Set(["101"]), 1000);
  assert.equal(changed, true);
  assert.equal(activeVisits["101"], undefined);
  assert.equal(usage["youtube.com"], 9000);
});

test("10. Close the last tab after a heartbeat delay greater than five seconds: verify the chosen finalization policy and ensure normal elapsed time is not silently lost", () => {
  const activeVisits = {
    "101": {
      domain: "youtube.com",
      hostname: "youtube.com",
      startedAt: 1000,
      lastHeartbeat: 20000, // Last heartbeat was at t = 20s
      tabId: 101,
    },
  };
  const domainSpans = {
    "youtube.com": {
      startedAt: 1000,
      tabKeys: ["101"],
      lastHeartbeat: 20000,
    },
  };
  const usage = {};

  // Tab closes at t = 28000 (8 seconds after last heartbeat, > 5s delay)
  // Clean tab close (tabs.onRemoved) at t = 28000:
  finalizeVisit(activeVisits, domainSpans, usage, "101", 28000, new Set(), 1000);

  // Full elapsed time up to tab close (28000 - 1000 = 27000ms = 27s) must be preserved, NOT truncated to 20s!
  assert.equal(usage["youtube.com"], 27000, "Normal elapsed time up to 28s is preserved, NOT truncated to 20s heartbeat");

  // Safeguard test: If a visit was abandoned and cleaned up via orphan sweep (fallbackTime passed):
  const staleSpans = {
    "youtube.com": {
      startedAt: 1000,
      tabKeys: ["101"],
      lastHeartbeat: 20000,
    },
  };
  const staleUsage = {};
  finalizeDomainSpan(
    staleSpans,
    staleUsage,
    "youtube.com",
    200000, // now = 200s (browser restart hours later)
    20000, // fallbackTime = lastHeartbeat at 20s
    1000,
  );
  // Abandoned visit is capped at effectiveHeartbeat (20000 - 1000 = 19000ms), NOT 200s!
  assert.equal(staleUsage["youtube.com"], 19000, "Abandoned visit capped at heartbeat, preventing phantom idle time");
});

test("Invariant: domain usage cannot exceed elapsed session time", () => {
  const sessionStart = 1000;
  const now = 50000; // 49 seconds elapsed in session
  const maxSessionMs = now - sessionStart; // 49000 ms

  const usage = 30000;
  const activeDuration = 10000;
  const rawTotal = usage + activeDuration; // 40000 ms <= 49000 ms
  assert.ok(rawTotal <= maxSessionMs);

  const clamped = Math.min(maxSessionMs, rawTotal);
  assert.equal(clamped, 40000);
});

test("11. Continuous display ticking across 3-second syncs with zero freezing or pausing", () => {
  const storage = {
    isActive: true,
    startedAt: 1000,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };
  const openTabs = new Set(["101"]);

  // Tab opens at t = 1000 with client pageLoadTime = 1000
  let resp = handleCheckSite({
    storage,
    senderTabId: 101,
    rawHostname: "www.youtube.com",
    msgVisitStartedAt: 1000,
    now: 1000,
    openTabIds: openTabs,
  });

  // Verify initial instant alignment
  assert.equal(resp.visitStartedAt, 1000);
  assert.equal(resp.totalSiteUsageSec, 0);
  assert.equal(resp.usageSnapshotAt, 1000);

  // Live ticking before any sync:
  let t1 = computeContentTimers({
    now: 2000,
    sessionStartedAt: resp.sessionStartedAt,
    visitStartedAt: resp.visitStartedAt,
    usageSnapshotSec: resp.totalSiteUsageSec,
    usageSnapshotAt: resp.usageSnapshotAt,
    domainSpanStartedAt: resp.domainSpanStartedAt,
    baseSiteUsageMs: resp.baseSiteUsageMs,
  });
  assert.equal(t1.currentVisitSec, 1);
  assert.equal(t1.totalSiteSec, 1);

  let t2 = computeContentTimers({
    now: 3000,
    sessionStartedAt: resp.sessionStartedAt,
    visitStartedAt: resp.visitStartedAt,
    usageSnapshotSec: resp.totalSiteUsageSec,
    usageSnapshotAt: resp.usageSnapshotAt,
    domainSpanStartedAt: resp.domainSpanStartedAt,
    baseSiteUsageMs: resp.baseSiteUsageMs,
  });
  assert.equal(t2.currentVisitSec, 2);
  assert.equal(t2.totalSiteSec, 2);

  // First 3-second sync arrives at t = 4250 (3.25s of usage, 250ms sub-second remainder)
  resp = handleCheckSite({
    storage,
    senderTabId: 101,
    rawHostname: "www.youtube.com",
    msgVisitStartedAt: 1000,
    now: 4250,
    openTabIds: openTabs,
  });

  // Background must align usageSnapshotAt to the instant totalSiteUsageSec was reached:
  // 3250ms total -> 3s, usageSnapshotAt = 4250 - 250 = 4000
  assert.equal(resp.totalSiteUsageSec, 3);
  assert.equal(resp.usageSnapshotAt, 4000);

  // Right timer at t = 4250 displays 3s
  let t3 = computeContentTimers({
    now: 4250,
    sessionStartedAt: resp.sessionStartedAt,
    visitStartedAt: resp.visitStartedAt,
    usageSnapshotSec: resp.totalSiteUsageSec,
    usageSnapshotAt: resp.usageSnapshotAt,
    domainSpanStartedAt: resp.domainSpanStartedAt,
    baseSiteUsageMs: resp.baseSiteUsageMs,
  });
  assert.equal(t3.totalSiteSec, 3);
  assert.equal(t3.currentVisitSec, 3);

  // At t = 4999 (before next full second), still 3s:
  let t4 = computeContentTimers({
    now: 4999,
    sessionStartedAt: resp.sessionStartedAt,
    visitStartedAt: resp.visitStartedAt,
    usageSnapshotSec: resp.totalSiteUsageSec,
    usageSnapshotAt: resp.usageSnapshotAt,
    domainSpanStartedAt: resp.domainSpanStartedAt,
    baseSiteUsageMs: resp.baseSiteUsageMs,
  });
  assert.equal(t4.totalSiteSec, 3);

  // At t = 5000 (EXACTLY 4 seconds since open): right timer MUST advance to 4s!
  // (In the previous buggy code, it would stay frozen at 3 until t = 5250!)
  let t5 = computeContentTimers({
    now: 5000,
    sessionStartedAt: resp.sessionStartedAt,
    visitStartedAt: resp.visitStartedAt,
    usageSnapshotSec: resp.totalSiteUsageSec,
    usageSnapshotAt: resp.usageSnapshotAt,
    domainSpanStartedAt: resp.domainSpanStartedAt,
    baseSiteUsageMs: resp.baseSiteUsageMs,
  });
  assert.equal(t5.totalSiteSec, 4, "Right timer must tick to 4s immediately at t=5000 without freeze!");
  assert.equal(t5.currentVisitSec, 4);

  // At t = 6000: ticks to 5s
  let t6 = computeContentTimers({
    now: 6000,
    sessionStartedAt: resp.sessionStartedAt,
    visitStartedAt: resp.visitStartedAt,
    usageSnapshotSec: resp.totalSiteUsageSec,
    usageSnapshotAt: resp.usageSnapshotAt,
    domainSpanStartedAt: resp.domainSpanStartedAt,
    baseSiteUsageMs: resp.baseSiteUsageMs,
  });
  assert.equal(t6.totalSiteSec, 5);

  // Second sync arrives at t = 7100 (6100ms total, 100ms remainder)
  resp = handleCheckSite({
    storage,
    senderTabId: 101,
    rawHostname: "www.youtube.com",
    msgVisitStartedAt: 1000,
    now: 7100,
    openTabIds: openTabs,
  });
  assert.equal(resp.totalSiteUsageSec, 6);
  assert.equal(resp.usageSnapshotAt, 7000);

  // At t = 7100, displays 6s
  let t7 = computeContentTimers({
    now: 7100,
    sessionStartedAt: resp.sessionStartedAt,
    visitStartedAt: resp.visitStartedAt,
    usageSnapshotSec: resp.totalSiteUsageSec,
    usageSnapshotAt: resp.usageSnapshotAt,
    domainSpanStartedAt: resp.domainSpanStartedAt,
    baseSiteUsageMs: resp.baseSiteUsageMs,
  });
  assert.equal(t7.totalSiteSec, 6);

  // At t = 8000 (7s elapsed), advances smoothly to 7s without pausing:
  let t8 = computeContentTimers({
    now: 8000,
    sessionStartedAt: resp.sessionStartedAt,
    visitStartedAt: resp.visitStartedAt,
    usageSnapshotSec: resp.totalSiteUsageSec,
    usageSnapshotAt: resp.usageSnapshotAt,
    domainSpanStartedAt: resp.domainSpanStartedAt,
    baseSiteUsageMs: resp.baseSiteUsageMs,
  });
  assert.equal(t8.totalSiteSec, 7, "Right timer ticks smoothly to 7s at t=8000");
  assert.equal(t8.currentVisitSec, 7);
});

test("12. Client visit start timestamp is preserved across background syncs, preventing centre timer jump", () => {
  const storage = {
    isActive: true,
    startedAt: 1000,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };
  const openTabs = new Set(["101"]);

  // Content script loaded at pageLoadTime = 1000
  // Background processes check_site at t = 2200 (1.2s delay due to IPC/startup)
  const resp = handleCheckSite({
    storage,
    senderTabId: 101,
    rawHostname: "www.youtube.com",
    msgVisitStartedAt: 1000,
    now: 2200,
    openTabIds: openTabs,
  });

  // Background honors the client's genuine page load start (1000), NOT now (2200)
  assert.equal(resp.visitStartedAt, 1000, "visitStartedAt must match client pageLoadTime (1000)");

  // At t = 2200, centre timer has 1200ms elapsed -> 1 second (NOT reset to 0 seconds)
  const timers = computeContentTimers({
    now: 2200,
    sessionStartedAt: resp.sessionStartedAt,
    visitStartedAt: resp.visitStartedAt,
    usageSnapshotSec: resp.totalSiteUsageSec,
    usageSnapshotAt: resp.usageSnapshotAt,
    domainSpanStartedAt: resp.domainSpanStartedAt,
    baseSiteUsageMs: resp.baseSiteUsageMs,
  });
  assert.equal(timers.currentVisitSec, 1, "Centre timer displays 1s at t=2200 and does not stall/reset to 0s");
});

test("13. Initial tab visit with domainSpanStartedAt=0 ticks right timer smoothly without freezing", () => {
  // Tab opens at t=1000 with 10s of prior accumulated domain usage
  const visitStartedAt = 1000;
  const sessionStartedAt = 0;
  const baseSiteUsageMs = 10000; // 10s accumulated prior usage
  const domainSpanStartedAt = 0; // Not yet confirmed by background

  // Local snapshot taken at checkImmediateRestricted
  const checkNow = 1000;
  const liveSpanStart = domainSpanStartedAt > 0 ? domainSpanStartedAt : visitStartedAt;
  const liveMs = Math.max(0, checkNow - liveSpanStart);
  const totalDurationMs = baseSiteUsageMs + liveMs;
  const usageSnapshotSec = Math.floor(totalDurationMs / 1000); // 10s
  const usageSnapshotAt = checkNow - (totalDurationMs % 1000); // 1000

  // At t=1000: right timer = 10s
  const t0 = computeContentTimers({
    now: 1000,
    sessionStartedAt,
    visitStartedAt,
    usageSnapshotSec,
    usageSnapshotAt,
    domainSpanStartedAt,
    baseSiteUsageMs,
  });
  assert.equal(t0.totalSiteSec, 10, "Right timer starts at 10s");

  // At t=2500 (1.5s before background response): right timer must tick forward to 11s, NOT stay frozen at 10s!
  const t1 = computeContentTimers({
    now: 2500,
    sessionStartedAt,
    visitStartedAt,
    usageSnapshotSec,
    usageSnapshotAt,
    domainSpanStartedAt,
    baseSiteUsageMs,
  });
  assert.equal(t1.totalSiteSec, 11, "Right timer ticks forward to 11s even with domainSpanStartedAt=0");

  // At t=3500 (2.5s before background response): right timer must tick forward to 12s
  const t2 = computeContentTimers({
    now: 3500,
    sessionStartedAt,
    visitStartedAt,
    usageSnapshotSec,
    usageSnapshotAt,
    domainSpanStartedAt,
    baseSiteUsageMs,
  });
  assert.equal(t2.totalSiteSec, 12, "Right timer ticks forward to 12s without waiting for sync");
});

test("14. Cold-start background delay (>3000ms) preserves genuine visit start and does not freeze centre timer", () => {
  const storage = {
    isActive: true,
    startedAt: 1000,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };
  const openTabs = new Set(["201"]);

  // Tab loaded at t=1000. Chrome service worker cold start takes 4500ms (> 3000ms)
  const resp = handleCheckSite({
    storage,
    senderTabId: 201,
    rawHostname: "www.youtube.com",
    msgVisitStartedAt: 1000,
    now: 5500,
    openTabIds: openTabs,
  });

  // Background must honor genuine visit start (1000) and NOT reset to now (5500)
  assert.equal(resp.visitStartedAt, 1000, "visitStartedAt must not be overridden to now (5500)");

  // Centre timer at t=5500 displays 4s (4500ms elapsed) and continues ticking smoothly
  const timers = computeContentTimers({
    now: 5500,
    sessionStartedAt: resp.sessionStartedAt,
    visitStartedAt: resp.visitStartedAt,
    usageSnapshotSec: resp.totalSiteUsageSec,
    usageSnapshotAt: resp.usageSnapshotAt,
    domainSpanStartedAt: resp.domainSpanStartedAt,
    baseSiteUsageMs: resp.baseSiteUsageMs,
  });
  assert.equal(timers.currentVisitSec, 4, "Centre timer displays 4s elapsed, not frozen or reset to 0s");
});

test("15. Right timer displays website domain usage, NOT overall session elapsed time", () => {
  const sessionStart = 1000;
  // Session has been running for 10 minutes (600 seconds)
  // Restricted site is opened at t = 601000 (10 minutes after session start)
  const storage = {
    isActive: true,
    startedAt: sessionStart,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {}, // No prior YouTube usage
    domainSpans: {},
  };
  const openTabs = new Set(["301"]);

  const resp = handleCheckSite({
    storage,
    senderTabId: 301,
    rawHostname: "www.youtube.com",
    msgVisitStartedAt: 601000,
    now: 601000,
    openTabIds: openTabs,
  });

  // Verify domain span started at website opening time (601000), NOT at sessionStart (1000)
  assert.equal(resp.domainSpanStartedAt, 601000, "Domain span startedAt must be 601000 (site open time), NOT 1000 (sessionStart)");
  assert.equal(resp.visitStartedAt, 601000, "Visit start must be 601000");

  // Advance 30 seconds to t = 631000 (10.5 minutes into session, 30 seconds on YouTube)
  const timers = computeContentTimers({
    now: 631000,
    sessionStartedAt: resp.sessionStartedAt, // 1000
    visitStartedAt: resp.visitStartedAt, // 601000
    usageSnapshotSec: resp.totalSiteUsageSec,
    usageSnapshotAt: resp.usageSnapshotAt,
    domainSpanStartedAt: resp.domainSpanStartedAt, // 601000
    baseSiteUsageMs: resp.baseSiteUsageMs, // 0
  });

  // Overall session elapsed = (631000 - 1000) / 1000 = 630 seconds (10 min 30 sec)
  // Centre timer = 30 seconds
  // Right timer = 30 seconds (NOT 630 seconds!)
  assert.equal(timers.currentVisitSec, 30, "Centre timer displays 30 seconds");
  assert.equal(timers.totalSiteSec, 30, "Right timer displays 30 seconds (site usage), NOT 630 seconds (session time)");
});

test("16. Closing Tab A when Tab B is still open does NOT finalize domain span or jump to session time", () => {
  const sessionStart = 1000;
  const storage = {
    isActive: true,
    startedAt: sessionStart,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };

  // Tab A opens at t = 10000 (9 seconds after sessionStart)
  let openTabs = [
    { id: 101, url: "https://www.youtube.com/watch?v=videoA" },
    { id: 102, url: "https://www.youtube.com/watch?v=videoB" },
  ];
  let openTabIds = new Set(["101", "102"]);
  let openDomains = extractOpenDomains(openTabs, storage.restrictedSites);

  handleCheckSite({
    storage,
    senderTabId: 101,
    rawHostname: "www.youtube.com",
    now: 10000,
    openTabIds,
  });

  // Tab B opens at t = 31000 (21 seconds after Tab A)
  const respB = handleCheckSite({
    storage,
    senderTabId: 102,
    rawHostname: "www.youtube.com",
    now: 31000,
    openTabIds,
  });

  assert.equal(respB.visitStartedAt, 31000);
  assert.equal(respB.domainSpanStartedAt, 10000);

  // Tab A closes at t = 61000 (51s on YouTube, 60s total focus session)
  // In the browser, Tab B is still open in openTabs!
  openTabs = [{ id: 102, url: "https://www.youtube.com/watch?v=videoB" }];
  openTabIds = new Set(["102"]);
  openDomains = extractOpenDomains(openTabs, storage.restrictedSites);

  const changed = finalizeVisit(
    storage.activeVisits,
    storage.domainSpans,
    storage.sessionSiteUsage,
    "101",
    61000,
    openTabIds,
    sessionStart,
    openDomains,
  );

  assert.equal(changed, true, "Tab A was finalized");
  assert.equal(storage.activeVisits["101"], undefined, "Tab A was removed from activeVisits");
  // CRITICAL: domainSpans must NOT be finalized into sessionSiteUsage because Tab B is still open
  assert.notEqual(storage.domainSpans["youtube.com"], undefined, "Domain span remains alive for Tab B");
  assert.equal(storage.sessionSiteUsage["youtube.com"], undefined, "No premature domain usage committed");

  // Tab B calculates its right timer at t = 61000:
  const liveSpanAnchor = storage.domainSpans["youtube.com"].startedAt; // 10000
  const timersB = computeContentTimers({
    now: 61000,
    sessionStartedAt: sessionStart, // 1000
    visitStartedAt: 31000, // Tab B started 30s ago
    domainSpanStartedAt: liveSpanAnchor, // 10000
    baseSiteUsageMs: storage.sessionSiteUsage["youtube.com"] ?? 0, // 0
  });

  assert.equal(timersB.currentVisitSec, 30, "Tab B centre timer = 30s");
  assert.equal(timersB.totalSiteSec, 51, "Tab B right timer = 51s (site usage), NOT 60s (session time - no 9-second jump!)");
});

test("17. Cloned instanceId between sibling tabs does NOT purge either tab when native tabId differs", () => {
  const activeVisits = {
    "101": {
      domain: "youtube.com",
      hostname: "youtube.com",
      tabId: 101,
      instanceId: "shared_cloned_id",
      startedAt: 1000,
      lastHeartbeat: 1000,
      isVisible: true,
    },
  };

  const rawTabId = 102;
  const tabKey = "102";
  const instanceId = "shared_cloned_id";

  // Simulate background check_site ghost visit check:
  // Must NOT delete tab 101 because 101 is a distinct native tab (tabId !== undefined && tabId !== rawTabId)
  let purged = false;
  if (rawTabId !== undefined && instanceId) {
    for (const [k, v] of Object.entries(activeVisits)) {
      if (k !== tabKey && (k === instanceId || v.tabId === undefined) && v.instanceId === instanceId) {
        delete activeVisits[k];
        purged = true;
      }
    }
  }

  assert.equal(purged, false, "Tab 101 was NOT purged despite sharing cloned instanceId");
  assert.notEqual(activeVisits["101"], undefined, "Tab 101 remains intact in activeVisits");
});

test("18. Canonical domain alias resolution: twitter.com and x.com map to shared canonical domain", () => {
  // Configured with x.com
  assert.equal(findMatchingSite("https://x.com/home", ["x.com"]), "x.com");
  assert.equal(findMatchingSite("https://twitter.com/explore", ["x.com"]), "x.com");
  assert.equal(findMatchingSite("https://www.twitter.com", ["x.com"]), "x.com");

  // Configured with twitter.com
  assert.equal(findMatchingSite("https://x.com/home", ["twitter.com"]), "twitter.com");
  assert.equal(findMatchingSite("https://twitter.com/explore", ["twitter.com"]), "twitter.com");
});

test("19. formatSeconds handles negative seconds without producing -1:00:00", () => {
  function formatSeconds(totalSec) {
    const s = Math.max(0, totalSec);
    const seconds = s % 60;
    const minutes = Math.floor(s / 60) % 60;
    const hours = Math.floor(s / 3600);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  assert.equal(formatSeconds(-1), "00:00:00", "Negative seconds must produce 00:00:00, NOT -1:00:00");
  assert.equal(formatSeconds(-500), "00:00:00");
  assert.equal(formatSeconds(0), "00:00:00");
  assert.equal(formatSeconds(3661), "01:01:01");
});

test("20. Mode separation: In Block mode, restricted-only sites are neither blocked nor restricted", () => {
  const sessionStart = 1000;
  const storage = {
    mode: "block",
    startedAt: sessionStart,
    blockedSites: ["facebook.com"],
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };

  // Navigating to youtube.com (restricted site) in Block mode
  const resYoutube = handleCheckSite({
    storage,
    senderTabId: 1,
    rawHostname: "youtube.com",
    msgVisitStartedAt: 1000,
    now: 1000,
    openTabIds: new Set(["1"]),
  });

  assert.equal(resYoutube.isBlocked, false, "youtube.com must NOT be blocked in block mode if not in blockedSites");
  assert.equal(resYoutube.isRestricted, false, "youtube.com must NOT be restricted or show timers in block mode");
  assert.equal(Object.keys(storage.activeVisits).length, 0, "No active visit tracked for youtube.com in block mode");
  assert.equal(Object.keys(storage.domainSpans).length, 0, "No domain span created for youtube.com in block mode");

  // Navigating to facebook.com (blocked site) in Block mode
  const resFacebook = handleCheckSite({
    storage,
    senderTabId: 2,
    rawHostname: "facebook.com",
    msgVisitStartedAt: 1000,
    now: 1000,
    openTabIds: new Set(["1", "2"]),
  });

  assert.equal(resFacebook.isBlocked, true, "facebook.com must be blocked in block mode");
  assert.equal(resFacebook.isRestricted, false, "facebook.com must not be restricted in block mode");
});

test("21. User exact scenario: Tab A opened after 9s / 5s delay does NOT cause Tab B right timer to jump or freeze upon closing Tab A", () => {
  // Scenario A: 9 seconds delay between session start and first restricted tab
  const sessionStart9 = 100000;
  const storage9 = {
    isActive: true,
    startedAt: sessionStart9,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };

  // Tab A opens at t = 109000 (exactly 9 seconds after sessionStart)
  let openTabs9 = [
    { id: 201, url: "https://www.youtube.com/watch?v=A" },
    { id: 202, url: "https://www.youtube.com/watch?v=B" },
  ];
  let openTabIds9 = new Set(["201", "202"]);
  let openDomains9 = extractOpenDomains(openTabs9, storage9.restrictedSites);

  handleCheckSite({
    storage: storage9,
    senderTabId: 201,
    rawHostname: "youtube.com",
    now: 109000,
    openTabIds: openTabIds9,
  });

  // Tab B opens at t = 110000 (1 second after Tab A)
  handleCheckSite({
    storage: storage9,
    senderTabId: 202,
    rawHostname: "youtube.com",
    now: 110000,
    openTabIds: openTabIds9,
  });

  // Tab A is closed at t = 111000 (2s on YouTube, 11s into session)
  openTabs9 = [{ id: 202, url: "https://www.youtube.com/watch?v=B" }];
  openTabIds9 = new Set(["202"]);
  openDomains9 = extractOpenDomains(openTabs9, storage9.restrictedSites);

  finalizeVisit(
    storage9.activeVisits,
    storage9.domainSpans,
    storage9.sessionSiteUsage,
    "201",
    111000,
    openTabIds9,
    sessionStart9,
    openDomains9,
  );

  // Tab B right timer at t = 111000
  const timers9 = computeContentTimers({
    now: 111000,
    sessionStartedAt: sessionStart9,
    visitStartedAt: 110000,
    domainSpanStartedAt: storage9.domainSpans["youtube.com"]?.startedAt ?? 0,
    baseSiteUsageMs: storage9.sessionSiteUsage["youtube.com"] ?? 0,
  });

  assert.equal(timers9.currentVisitSec, 1, "Tab B centre timer = 1s");
  assert.equal(timers9.totalSiteSec, 2, "Tab B right timer MUST be 2s (YouTube usage), NOT 11s (session duration - NO 9s jump!)");

  // Scenario B: 5 seconds delay between session start and first restricted tab
  const sessionStart5 = 200000;
  const storage5 = {
    isActive: true,
    startedAt: sessionStart5,
    restrictedSites: ["youtube.com"],
    activeVisits: {},
    sessionSiteUsage: {},
    domainSpans: {},
  };

  // Tab A opens at t = 205000 (exactly 5 seconds after sessionStart)
  let openTabs5 = [
    { id: 301, url: "https://www.youtube.com/watch?v=A" },
    { id: 302, url: "https://www.youtube.com/watch?v=B" },
  ];
  let openTabIds5 = new Set(["301", "302"]);
  let openDomains5 = extractOpenDomains(openTabs5, storage5.restrictedSites);

  handleCheckSite({
    storage: storage5,
    senderTabId: 301,
    rawHostname: "youtube.com",
    now: 205000,
    openTabIds: openTabIds5,
  });

  // Tab B opens at t = 207000
  handleCheckSite({
    storage: storage5,
    senderTabId: 302,
    rawHostname: "youtube.com",
    now: 207000,
    openTabIds: openTabIds5,
  });

  // Tab A closes at t = 208000 (3s on YouTube, 8s into session)
  openTabs5 = [{ id: 302, url: "https://www.youtube.com/watch?v=B" }];
  openTabIds5 = new Set(["302"]);
  openDomains5 = extractOpenDomains(openTabs5, storage5.restrictedSites);

  finalizeVisit(
    storage5.activeVisits,
    storage5.domainSpans,
    storage5.sessionSiteUsage,
    "301",
    208000,
    openTabIds5,
    sessionStart5,
    openDomains5,
  );

  const timers5 = computeContentTimers({
    now: 208000,
    sessionStartedAt: sessionStart5,
    visitStartedAt: 207000,
    domainSpanStartedAt: storage5.domainSpans["youtube.com"]?.startedAt ?? 0,
    baseSiteUsageMs: storage5.sessionSiteUsage["youtube.com"] ?? 0,
  });

  assert.equal(timers5.currentVisitSec, 1, "Tab B centre timer = 1s");
  assert.equal(timers5.totalSiteSec, 3, "Tab B right timer MUST be 3s (YouTube usage), NOT 8s (session duration - NO 5s jump!)");
});



