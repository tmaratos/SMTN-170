/**
 * TN-170 Steward — portal site awareness index (client-side, no secrets).
 * Full index builds only on prompt-triggered site/navigation questions; current page context is always cheap/DOM-only.
 */
(function initStewardSiteIndex(global) {
  const CACHE_PREFIX = "stewardSiteIndex:";
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const LEGACY_CACHE_KEY = "smtn170_steward_site_index_v1";

  const SITE_INDEX_PHRASES = [
    "where is",
    "where can i",
    "where do i",
    "where are",
    "how do i",
    "how do you",
    "how can i",
    "how to get to",
    "how to find",
    "how to open",
    "take me to",
    "go to",
    "navigate to",
    "navigate",
    "open the",
    "show me the",
    "show me where",
    "find the",
    "find page",
    "which page",
    "what page",
    "portal page",
    "portal pages",
    "site map",
    "pages on",
    "pages in",
    "pages available",
    "menu",
    "navigation",
    "sidebar",
    "what can i do on",
    "what is on",
    "help me find",
    "direct me to",
    "link to",
    "get to the",
  ];

  const PAGE_REGISTRY = {
    "dashboard.html": {
      pageId: "home",
      title: "Home",
      path: "dashboard.html",
      section: "Main",
      summary: "Squadron operations dashboard with quick links to meetings, tasks, readiness, and Steward.",
      primaryActions: ["Open Steward", "View calendar", "Check tasks"],
      forms: [],
      buttons: ["Open Steward"],
      relatedPages: ["calendar.html", "schedule.html", "tasks.html", "documents.html"],
      keywords: ["home", "dashboard", "overview", "operations"],
    },
    "calendar.html": {
      pageId: "calendar",
      title: "Calendar",
      path: "calendar.html",
      section: "Main",
      summary: "Post squadron events and review upcoming meeting nights and activities.",
      primaryActions: ["Add event", "Open meeting planner"],
      forms: ["calendarAddForm"],
      buttons: ["Add to calendar", "Meeting planner"],
      relatedPages: ["schedule.html", "flight-review.html"],
      keywords: ["calendar", "events", "meetings", "schedule"],
    },
    "schedule.html": {
      pageId: "schedule",
      title: "Meetings",
      path: "schedule.html",
      section: "Main",
      summary: "Build the monthly squadron meeting schedule with uniforms and training nights.",
      primaryActions: ["Build schedule", "Print schedule"],
      forms: ["scheduleBuilderForm"],
      buttons: ["Generate schedule", "Save schedule"],
      relatedPages: ["calendar.html", "documents.html"],
      keywords: ["meetings", "schedule", "meeting planner", "agenda", "uniform"],
    },
    "tasks.html": {
      pageId: "tasks",
      title: "Tasks",
      path: "tasks.html",
      section: "Readiness",
      summary: "Squadron tasks and follow-ups shared with approved Senior Members.",
      primaryActions: ["Add task", "Filter open tasks"],
      forms: ["taskForm"],
      buttons: ["Add task", "Mark complete"],
      relatedPages: ["dashboard.html", "sui-readiness.html"],
      keywords: ["tasks", "follow-up", "assignments", "todo"],
    },
    "orgchart.html": {
      pageId: "orgchart",
      title: "Organization Chart",
      path: "orgchart.html",
      section: "Main",
      summary: "Squadron leadership structure, staff assignments, and vacant positions.",
      primaryActions: ["Add position", "View vacancies", "Ask Steward"],
      forms: ["orgPositionForm"],
      buttons: ["Add", "Vacancies", "Steward"],
      relatedPages: ["admin.html", "senior-member.html"],
      keywords: ["org chart", "organization", "staff", "vacancies", "billets"],
    },
    "flight-review.html": {
      pageId: "bfr",
      title: "Flight Reviews",
      path: "flight-review.html",
      section: "Readiness",
      summary: "Track BFR packets, department flight review status, and schedule review nights.",
      primaryActions: ["Schedule review night", "View department status"],
      forms: ["frScheduleForm"],
      buttons: ["Post to calendar"],
      relatedPages: ["calendar.html", "documents.html"],
      keywords: ["BFR", "flight review", "biannual flight review", "currency", "expiration"],
    },
    "sui-readiness.html": {
      pageId: "sui",
      title: "Inspection Prep",
      path: "sui-readiness.html",
      section: "Readiness",
      summary: "Work through unit inspection checklist items by area and track readiness.",
      primaryActions: ["Review checklist", "Mark items complete"],
      forms: ["suiChecklistForm"],
      buttons: ["Save progress"],
      relatedPages: ["tasks.html", "documents.html"],
      keywords: ["inspection", "SUI", "readiness", "checklist", "compliance"],
    },
    "documents.html": {
      pageId: "files",
      title: "Files & Resources",
      path: "documents.html",
      section: "Main",
      summary:
        "Resource links and squadron reference materials. Upload/import is not part of V1.",
      primaryActions: ["Browse resource links", "Open CAP references"],
      forms: [],
      buttons: ["Open link"],
      relatedPages: ["schedule.html", "senior-member.html"],
      keywords: ["files", "resources", "links", "forms", "references", "documents"],
    },
    "senior-member.html": {
      pageId: "senior",
      title: "Senior Member Workspace",
      path: "senior-member.html",
      section: "Operations",
      summary: "Hub for flight reviews, inspection prep, meetings, files, and org chart.",
      primaryActions: ["Open flight reviews", "Open inspection prep", "Open meeting planner"],
      forms: [],
      buttons: ["Flight reviews", "Inspection prep", "Meeting planner"],
      relatedPages: ["flight-review.html", "sui-readiness.html", "schedule.html"],
      keywords: ["senior member", "workspace", "operations", "staff planning"],
    },
    "profile.html": {
      pageId: "profile",
      title: "My Profile",
      path: "profile.html",
      section: "Account",
      summary: "View and update your TN-170 portal profile, role, and contact details.",
      primaryActions: ["Edit profile", "Save changes"],
      forms: ["profileForm"],
      buttons: ["Save profile"],
      relatedPages: ["dashboard.html"],
      keywords: ["profile", "account", "name", "rank", "contact"],
    },
    "admin.html": {
      pageId: "admin",
      title: "Admin",
      path: "admin.html",
      section: "Account",
      summary: "Command staff user management — approve pending members and manage roles.",
      primaryActions: ["Approve users", "Manage roles"],
      forms: ["adminUserForm"],
      buttons: ["Approve", "Deny", "Change role"],
      relatedPages: ["pending-approval.html", "profile.html"],
      keywords: ["admin", "approve users", "user management", "roles", "pending approval"],
      adminOnly: true,
    },
    "create-profile.html": {
      pageId: "create-profile",
      title: "Create Profile",
      path: "create-profile.html",
      section: "Account",
      summary: "Set up your TN-170 portal profile using a squadron invite link.",
      primaryActions: ["Submit profile"],
      forms: ["createProfileForm"],
      buttons: ["Create profile"],
      relatedPages: ["pending-approval.html", "login.html"],
      keywords: ["create profile", "signup", "invite", "registration"],
      public: true,
    },
    "pending-approval.html": {
      pageId: "pending",
      title: "Awaiting Approval",
      path: "pending-approval.html",
      section: "Account",
      summary: "Your account is awaiting approval by squadron leadership.",
      primaryActions: ["Log out"],
      forms: [],
      buttons: ["Log out"],
      relatedPages: ["login.html"],
      keywords: ["pending", "approval", "awaiting"],
      public: true,
    },
    "access-denied.html": {
      pageId: "denied",
      title: "Access Denied",
      path: "access-denied.html",
      section: "Account",
      summary: "Your profile was not approved for the TN-170 Senior Member portal.",
      primaryActions: ["Log out"],
      forms: [],
      buttons: ["Log out"],
      relatedPages: ["login.html"],
      keywords: ["denied", "access denied", "not approved"],
      public: true,
    },
  };

  const NAV_LINKS = [
    { label: "Home", target: "dashboard.html", section: "Main", keywords: ["home", "dashboard"] },
    { label: "Calendar", target: "calendar.html", section: "Main", keywords: ["calendar", "events"] },
    { label: "Meetings", target: "schedule.html", section: "Main", keywords: ["meetings", "schedule", "meeting planner"] },
    { label: "Files & Resources", target: "documents.html", section: "Main", keywords: ["files", "resources", "links"] },
    { label: "Organization Chart", target: "orgchart.html", section: "Main", keywords: ["org chart", "organization"] },
    { label: "Flight Reviews", target: "flight-review.html", section: "Readiness", keywords: ["BFR", "flight review"] },
    { label: "Inspection Prep", target: "sui-readiness.html", section: "Readiness", keywords: ["inspection", "SUI", "readiness"] },
    { label: "Tasks", target: "tasks.html", section: "Readiness", keywords: ["tasks", "follow-up"] },
    { label: "Senior Member Workspace", target: "senior-member.html", section: "Operations", keywords: ["senior member", "workspace"] },
    { label: "My Profile", target: "profile.html", section: "Account", keywords: ["profile", "account"] },
    { label: "Admin", target: "admin.html", section: "Account", keywords: ["admin", "approve users"], adminOnly: true },
  ];

  const KEYWORD_ROUTES = [
    { patterns: [/approve\s+users?/i, /user\s+management/i, /manage\s+users?/i, /pending\s+members?/i], target: "admin.html", label: "Admin", adminOnly: true },
    { patterns: [/\bbfr\b/i, /flight\s+review/i, /biannual/i], target: "flight-review.html", label: "Flight Reviews" },
    { patterns: [/create\s+(a\s+)?meeting/i, /build\s+(the\s+)?schedule/i, /meeting\s+planner/i, /meeting\s+schedule/i], target: "schedule.html", label: "Meetings" },
    { patterns: [/take\s+me\s+to\s+(the\s+)?calendar/i, /open\s+calendar/i, /go\s+to\s+calendar/i, /^calendar$/i], target: "calendar.html", label: "Calendar" },
    { patterns: [/inspection/i, /\bsui\b/i, /readiness\s+checklist/i], target: "sui-readiness.html", label: "Inspection Prep" },
    { patterns: [/org\s*chart/i, /organization\s+chart/i, /vacant\s+positions?/i], target: "orgchart.html", label: "Organization Chart" },
    { patterns: [/resource\s+links?/i, /files?\s+(&|and)\s+resources?/i], target: "documents.html", label: "Files & Resources" },
    { patterns: [/\btasks?\b/i, /open\s+tasks?/i], target: "tasks.html", label: "Tasks" },
    { patterns: [/my\s+profile/i, /edit\s+profile/i], target: "profile.html", label: "My Profile" },
    { patterns: [/dashboard/i, /\bhome\b/i], target: "dashboard.html", label: "Home" },
  ];

  let buildPromise = null;

  function cacheKey() {
    return `${CACHE_PREFIX}${getUserRole()}`;
  }

  function currentPath() {
    const path = (global.location?.pathname || "").split("/").pop();
    return path || "dashboard.html";
  }

  function getUserRole() {
    const profile = global.SMTN170Auth?.getProfile?.();
    return String(profile?.role || global.SMTN170Auth?.loadSession?.()?.role || "member").toLowerCase();
  }

  function isApprovedUser() {
    const profile = global.SMTN170Auth?.getProfile?.() || global.SMTN170Auth?.loadSession?.();
    if (!profile) return false;
    return global.SMTN170Profile?.isProfileStatusApproved?.(profile) ?? false;
  }

  function canAccessAdmin() {
    return !!(global.SMTN170Auth?.isAdmin?.() || global.TN170AuthGuard?.canAccessAdmin?.(global.SMTN170Auth?.getProfile?.()));
  }

  function readJsonScript(id) {
    const el = document.getElementById(id);
    if (!el?.textContent?.trim()) return null;
    try {
      return JSON.parse(el.textContent);
    } catch {
      return null;
    }
  }

  function readCurrentPageMeta() {
    return readJsonScript("steward-page-meta") || global.STEWARD_PAGE_META || null;
  }

  function sanitizeText(text, maxLen) {
    const clean = String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLen || 120);
    if (/password|token|secret|api[_-]?key/i.test(clean)) return "";
    return clean;
  }

  function normalizeQuery(query) {
    return String(query || "")
      .toLowerCase()
      .replace(/[^\w\s&/-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function shouldBuildSiteIndexForMessage(message) {
    const q = normalizeQuery(message);
    if (!q) return false;
    return SITE_INDEX_PHRASES.some((phrase) => q.includes(phrase));
  }

  function parseStewardElements(doc) {
    const actions = [];
    doc.querySelectorAll("[data-steward-action]").forEach((el) => {
      actions.push({
        action: sanitizeText(el.getAttribute("data-steward-action"), 40),
        label: sanitizeText(el.getAttribute("data-steward-label") || el.textContent, 80),
        target: sanitizeText(el.getAttribute("data-steward-target") || el.getAttribute("href") || "", 80),
        help: sanitizeText(el.getAttribute("data-steward-help"), 160),
      });
    });
    return actions.filter((a) => a.action || a.label);
  }

  function readVisibleNavFromDom() {
    const items = [];
    document.querySelectorAll("#portalNav a.portal-nav-link, #portalNav button.portal-nav-link").forEach((el) => {
      const label = sanitizeText(el.textContent, 60);
      const target = sanitizeText(el.getAttribute("href") || el.getAttribute("data-steward-target") || "", 80);
      if (label) items.push({ label, target: target || null, section: null });
    });
    if (items.length) return items;
    return buildNavIndex();
  }

  function buildCurrentPageContext() {
    const meta = readCurrentPageMeta();
    const path = meta?.path || currentPath();
    const docTitle = sanitizeText((document.title || "").replace(/\s*\|.*$/i, "").trim(), 80);
    const title = meta?.title || docTitle || path;

    return {
      path,
      title,
      section: meta?.section || null,
      summary: meta?.summary || null,
      primaryActions: meta?.primaryActions || [],
      visibleNav: readVisibleNavFromDom().slice(0, 20),
    };
  }

  function parseHtmlDocument(html, path) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const metaEl = doc.getElementById("steward-page-meta");
    let meta = null;
    if (metaEl?.textContent?.trim()) {
      try {
        meta = JSON.parse(metaEl.textContent);
      } catch {
        meta = null;
      }
    }

    const headings = [];
    doc.querySelectorAll("h1, h2, h3").forEach((h) => {
      const text = sanitizeText(h.textContent, 80);
      if (text) headings.push(text);
    });

    const buttons = [];
    doc.querySelectorAll("button, .btn-gold, .btn-primary-lg, a.btn-gold").forEach((el) => {
      const text = sanitizeText(el.textContent, 60);
      if (text) buttons.push(text);
    });

    const forms = [];
    doc.querySelectorAll("form[id]").forEach((f) => {
      if (f.id) forms.push(f.id);
    });

    const stewardActions = parseStewardElements(doc);

    return {
      path,
      meta,
      headings: headings.slice(0, 12),
      buttons: [...new Set(buttons)].slice(0, 12),
      forms: [...new Set(forms)].slice(0, 8),
      stewardActions,
    };
  }

  async function fetchPageSnapshot(path) {
    try {
      const res = await fetch(path, { credentials: "same-origin", cache: "no-cache" });
      if (!res.ok) return null;
      const html = await res.text();
      return parseHtmlDocument(html, path);
    } catch {
      return null;
    }
  }

  function mergePageEntry(path, registryEntry, snapshot) {
    const base = { ...(registryEntry || {}), path };
    if (snapshot?.meta) Object.assign(base, snapshot.meta);
    if (snapshot?.headings?.length) base.headings = snapshot.headings;
    if (snapshot?.buttons?.length) base.buttons = [...new Set([...(base.buttons || []), ...snapshot.buttons])].slice(0, 12);
    if (snapshot?.forms?.length) base.forms = [...new Set([...(base.forms || []), ...snapshot.forms])].slice(0, 8);
    if (snapshot?.stewardActions?.length) base.stewardActions = snapshot.stewardActions;
    return base;
  }

  function compactPage(page) {
    return {
      title: page.title,
      path: page.path,
      section: page.section,
      summary: page.summary,
      headings: page.headings || [],
      buttons: page.buttons || [],
      relatedPages: page.relatedPages || [],
      keywords: page.keywords || [],
    };
  }

  function filterPagesForRole(pages) {
    return pages.filter((p) => !(p.adminOnly && !canAccessAdmin()));
  }

  function buildNavIndex() {
    return NAV_LINKS.filter((n) => !n.adminOnly || canAccessAdmin()).map((n) => ({
      label: n.label,
      target: n.target,
      section: n.section,
      keywords: n.keywords,
    }));
  }

  function loadCache() {
    try {
      const raw = sessionStorage.getItem(cacheKey());
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.index || Date.now() - (data.at || 0) > CACHE_TTL_MS) return null;
      global.STEWARD_SITE_INDEX = data.index;
      return data.index;
    } catch {
      return null;
    }
  }

  function saveCache(index) {
    try {
      sessionStorage.setItem(cacheKey(), JSON.stringify({ at: Date.now(), index }));
    } catch {
      /* ignore */
    }
  }

  function clearCache() {
    global.STEWARD_SITE_INDEX = null;
    buildPromise = null;
    try {
      const keys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.startsWith(CACHE_PREFIX) || key === LEGACY_CACHE_KEY)) keys.push(key);
      }
      keys.forEach((k) => sessionStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  }

  async function buildFullSiteIndex(options) {
    if (!isApprovedUser() && !options?.force) {
      global.STEWARD_SITE_INDEX = null;
      return null;
    }

    const cached = !options?.refresh ? loadCache() : null;
    if (cached) return cached;

    if (buildPromise && !options?.refresh) return buildPromise;

    buildPromise = (async () => {
      const paths = Object.keys(PAGE_REGISTRY);
      const snapshots = await Promise.all(
        paths.map(async (path) => {
          if (path === currentPath()) {
            const live = {
              meta: readCurrentPageMeta(),
              headings: [],
              buttons: [],
              forms: [],
              stewardActions: parseStewardElements(document),
            };
            document.querySelectorAll("h1, h2, h3").forEach((h) => {
              const text = sanitizeText(h.textContent, 80);
              if (text) live.headings.push(text);
            });
            document.querySelectorAll("form[id]").forEach((f) => {
              if (f.id) live.forms.push(f.id);
            });
            return { path, snapshot: live };
          }
          const snapshot = await fetchPageSnapshot(path);
          return { path, snapshot };
        })
      );

      const pages = filterPagesForRole(
        snapshots
          .map(({ path, snapshot }) => compactPage(mergePageEntry(path, PAGE_REGISTRY[path], snapshot)))
          .filter((p) => {
            const reg = PAGE_REGISTRY[p.path];
            return !(reg?.adminOnly && !canAccessAdmin());
          })
      );

      const index = {
        generatedAt: new Date().toISOString(),
        currentPath: currentPath(),
        userRole: getUserRole(),
        canAccessAdmin: canAccessAdmin(),
        pages,
        nav: buildNavIndex(),
      };

      global.STEWARD_SITE_INDEX = index;
      saveCache(index);
      buildPromise = null;
      return index;
    })();

    return buildPromise;
  }

  function get() {
    if (global.STEWARD_SITE_INDEX) return global.STEWARD_SITE_INDEX;
    return loadCache();
  }

  function scorePage(page, query) {
    const q = normalizeQuery(query);
    if (!q) return 0;
    let score = 0;
    const hay = [
      page.title,
      page.summary,
      page.section,
      ...(page.keywords || []),
      ...(page.primaryActions || []),
      ...(page.headings || []),
    ]
      .join(" ")
      .toLowerCase();
    q.split(" ").forEach((term) => {
      if (term.length < 2) return;
      if (hay.includes(term)) score += 2;
    });
    if (hay.includes(q)) score += 5;
    (page.keywords || []).forEach((kw) => {
      if (q.includes(String(kw).toLowerCase()) || String(kw).toLowerCase().includes(q)) score += 4;
    });
    return score;
  }

  function findPageByKeyword(query) {
    const index = get();
    if (!index?.pages?.length) return null;
    let best = null;
    let bestScore = 0;
    index.pages.forEach((page) => {
      const score = scorePage(page, query);
      if (score > bestScore) {
        bestScore = score;
        best = page;
      }
    });
    return bestScore > 0 ? best : null;
  }

  function findAction(query) {
    const index = get();
    const q = normalizeQuery(query);

    for (const route of KEYWORD_ROUTES) {
      if (route.adminOnly && !canAccessAdmin()) continue;
      if (route.patterns.some((p) => p.test(q))) {
        return {
          action: "navigate",
          label: route.label,
          target: route.target,
          help: `Open ${route.label}`,
        };
      }
    }

    if (!index) return null;

    let best = null;
    index.pages.forEach((page) => {
      (page.stewardActions || []).forEach((a) => {
        const label = normalizeQuery(a.label);
        if (label && (q.includes(label) || label.includes(q))) best = a;
      });
    });
    return best;
  }

  function explainCurrentPage() {
    const path = currentPath();
    const page =
      get()?.pages?.find((p) => p.path === path) || readCurrentPageMeta() || PAGE_REGISTRY[path];
    if (!page) return { path, summary: "Unknown portal page." };
    return {
      path: page.path || path,
      title: page.title,
      section: page.section,
      summary: page.summary,
      primaryActions: page.primaryActions || [],
      relatedPages: page.relatedPages || [],
    };
  }

  function getNavigationTarget(query) {
    const action = findAction(query);
    if (action?.target) {
      if (action.target === "admin.html" && !canAccessAdmin()) return null;
      return { path: action.target, label: action.label || action.target };
    }
    const page = findPageByKeyword(query);
    if (page?.path) return { path: page.path, label: page.title || page.path };
    return null;
  }

  function isNavigationIntent(message) {
    const q = normalizeQuery(message);
    return /^(take\s+me\s+to|go\s+to|open|navigate\s+to|show\s+me)\b/.test(q) || KEYWORD_ROUTES.some((r) => r.patterns.some((p) => p.test(q)));
  }

  function buildSummaryForWorker(message) {
    const index = get();
    if (!index) return null;

    const q = String(message || "").trim();
    const matchingPages = q
      ? index.pages
          .map((p) => ({ page: p, score: scorePage(p, q) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 4)
          .map((x) => ({
            path: x.page.path,
            title: x.page.title,
            section: x.page.section,
            summary: x.page.summary,
            score: x.score,
          }))
      : [];

    const navTarget = q ? getNavigationTarget(q) : null;
    const matchingActions = [];
    if (navTarget) {
      matchingActions.push({ label: navTarget.label, target: navTarget.path });
    }
    const action = findAction(q);
    if (action?.target && !matchingActions.some((a) => a.target === action.target)) {
      matchingActions.push({ label: action.label, target: action.target });
    }

    const current = explainCurrentPage();

    return {
      currentPage: { path: current.path, title: current.title, summary: current.summary },
      matchingPages,
      matchingActions,
      nav: index.nav.slice(0, 8),
      userRole: index.userRole,
      canAccessAdmin: index.canAccessAdmin,
      navigationIntent: isNavigationIntent(q),
    };
  }

  global.addEventListener("smtn170:auth-changed", () => {
    if (!isApprovedUser()) clearCache();
  });

  global.StewardSiteIndex = {
    shouldBuildSiteIndexForMessage,
    buildCurrentPageContext,
    buildFullSiteIndex,
    build: buildFullSiteIndex,
    clearCache,
    get,
    findPageByKeyword,
    findAction,
    explainCurrentPage,
    getNavigationTarget,
    buildSummaryForWorker,
    isNavigationIntent,
  };
})(window);
