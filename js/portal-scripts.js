/**
 * Standard script chain for protected portal pages.
 * Include once before </body>: <script src="./js/portal-scripts.js?v=11" data-page="dashboard"></script>
 * Or after auth-guard: TN170AuthGuard.loadPortalScripts("dashboard")
 */
(function loadPortalScripts() {
  const PAGE_SCRIPTS = {
    schedule: ["./js/portal-data.js", "./js/schedule-builder.js"],
    documents: ["./js/resource-links.js?v=1"],
    orgchart: ["./js/org-chart.js?v=9"],
    "flight-review": ["./flight-review.js"],
    "sui-readiness": ["./sui-readiness.js?v=9"],
    admin: ["./js/portal-data.js", "./js/portal-admin.js?v=2"],
    profile: ["./js/profile-page.js?v=11"],
    tasks: ["./js/tasks-page.js?v=9"],
    dashboard: ["./js/portal-data.js", "./js/portal-dashboard.js?v=8"],
    calendar: ["./flight-review.js"],
    resources: [],
    exports: ["./flight-review.js"],
  };

  const CORE_CHAIN = [
    "./portal-config.js?v=3",
    "./js/firebase-config.js?v=3",
    "./js/firebase-client.js?v=2",
    "./js/firebase-data.js?v=2",
    "./js/auth-guard.js?v=13",
    "./js/profile-service.js?v=2",
    "./js/auth.js?v=13",
    "./js/auth-session.js?v=8",
    "./portal-nav.js?v=18",
    "./js/portal-shell.js?v=12",
    "./js/portal-pages.js?v=3",
    "./js/steward-launcher.js?v=5",
    "./js/profile-banner.js?v=1",
    "./js/portal-bootstrap.js?v=11",
  ];

  function scriptBase(url) {
    return String(url || "").split("?")[0];
  }

  function isScriptLoaded(url) {
    const base = scriptBase(url);
    return !!document.querySelector(`script[src^="${base}"]`);
  }

  function dedupeUrls(urls) {
    const seen = new Set();
    return urls.filter((url) => {
      const base = scriptBase(url);
      if (seen.has(base) || isScriptLoaded(url)) return false;
      seen.add(base);
      return true;
    });
  }

  const page = document.currentScript?.dataset?.page || document.body?.dataset?.portalPage || "";
  const extras = PAGE_SCRIPTS[page] || [];
  const chain = dedupeUrls([...CORE_CHAIN, ...extras]);

  function loadSequentially(urls, i) {
    if (i >= urls.length) {
      global.SMTN170ScheduleBuilder?.init?.();
      global.SMTN170ResourceLinks?.init?.();
      global.SMTN170OrgChart?.init?.();
      global.SMTN170TasksPage?.init?.();
      global.SMTN170SuiReadiness?.init?.();
      global.SMTN170ProfilePage?.init?.();
      return;
    }
    const s = document.createElement("script");
    s.src = urls[i];
    s.onload = () => loadSequentially(urls, i + 1);
    s.onerror = () => loadSequentially(urls, i + 1);
    document.body.appendChild(s);
  }

  loadSequentially(chain, 0);
})();
