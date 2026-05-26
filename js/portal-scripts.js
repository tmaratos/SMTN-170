/**
 * Standard script chain for protected portal pages.
 * Include once before </body>: <script src="./js/portal-scripts.js?v=9" data-page="dashboard"></script>
 */
(function loadPortalScripts() {
  const PAGE_SCRIPTS = {
    schedule: ["./js/portal-data.js", "./js/schedule-builder.js"],
    documents: ["./js/resource-links.js?v=1"],
    orgchart: ["./js/org-chart.js?v=9"],
    "flight-review": ["./flight-review.js"],
    "sui-readiness": ["./sui-readiness.js?v=9"],
    admin: ["./js/portal-data.js", "./js/portal-admin.js"],
    profile: ["./js/profile-page.js?v=10"],
    tasks: ["./js/tasks-page.js?v=9"],
    dashboard: ["./js/portal-data.js", "./js/portal-dashboard.js?v=8"],
    calendar: ["./flight-review.js"],
    resources: [],
    exports: ["./flight-review.js"],
  };

  const chain = [
    "./portal-config.js?v=3",
    "./js/firebase-config.js?v=2",
    "./js/firebase-client.js?v=2",
    "./js/firebase-data.js?v=2",
    "./js/firebase-auth.js?v=1",
    "./js/steward-client.js?v=5",
    "./js/auth-guard.js?v=11",
    "./js/steward-site-index.js?v=1",
    "./js/profile-service.js?v=2",
    "./js/auth.js?v=11",
    "./js/auth-session.js?v=8",
    "./portal-nav.js?v=16",
    "./js/portal-shell.js?v=11",
    "./js/portal-pages.js?v=3",
    "./js/steward-launcher.js?v=3",
    "./js/steward-ui.js?v=4",
    "./app.js?v=8",
    "./js/profile-banner.js?v=1",
    "./js/portal-bootstrap.js?v=8",
  ];

  const page = document.currentScript?.dataset?.page || document.body?.dataset?.portalPage || "";
  const extras = PAGE_SCRIPTS[page] || [];

  function loadSequentially(urls, i) {
    if (i >= urls.length) {
      global.SMTN170ScheduleBuilder?.init?.();
      global.SMTN170ResourceLinks?.init?.();
      global.SMTN170OrgChart?.init?.();
      global.SMTN170TasksPage?.init?.();
      global.SMTN170SuiReadiness?.init?.();
      if (global.TN170_AUTH_SESSION_OK && global.StewardSiteIndex?.build) {
        global.StewardSiteIndex.build().catch((err) => console.warn("[StewardSiteIndex]", err));
      }
      return;
    }
    const s = document.createElement("script");
    s.src = urls[i];
    s.onload = () => loadSequentially(urls, i + 1);
    s.onerror = () => loadSequentially(urls, i + 1);
    document.body.appendChild(s);
  }

  loadSequentially([...chain, ...extras], 0);
})();
