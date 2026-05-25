/**
 * Standard script chain for protected portal pages.
 * Include once before </body>: <script src="./js/portal-scripts.js?v=7" data-page="dashboard"></script>
 */
(function loadPortalScripts() {
  const PAGE_SCRIPTS = {
    schedule: ["./js/portal-data.js", "./js/schedule-builder.js"],
    documents: ["./js/file-library.js"],
    orgchart: ["./js/org-chart.js?v=7"],
    "flight-review": ["./flight-review.js"],
    "sui-readiness": ["./sui-readiness.js?v=7"],
    admin: ["./js/portal-data.js", "./js/portal-admin.js"],
    profile: ["./js/profile-page.js?v=7"],
    tasks: ["./js/tasks-page.js?v=7"],
    dashboard: ["./js/portal-data.js", "./js/portal-dashboard.js?v=7"],
    calendar: ["./flight-review.js"],
    resources: [],
    exports: ["./flight-review.js"],
  };

  const chain = [
    "./portal-config.js?v=3",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    "./js/auth-guard.js?v=7",
    "./js/supabase-config.js?v=7",
    "./js/supabase-client.js?v=7",
    "./js/profile-service.js?v=1",
    "./js/auth.js?v=7",
    "./js/auth-session.js?v=7",
    "./portal-nav.js?v=11",
    "./js/portal-shell.js?v=7",
    "./js/portal-pages.js?v=3",
    "./js/steward-api.js?v=1",
    "./js/steward.js?v=10",
    "./app.js?v=7",
    "./js/profile-banner.js?v=1",
    "./js/portal-bootstrap.js?v=7",
  ];

  const page = document.currentScript?.dataset?.page || document.body?.dataset?.portalPage || "";
  const extras = PAGE_SCRIPTS[page] || [];

  function loadSequentially(urls, i) {
    if (i >= urls.length) {
      global.SMTN170ScheduleBuilder?.init?.();
      global.SMTN170FileLibrary?.init?.();
      global.SMTN170OrgChart?.init?.();
      global.SMTN170TasksPage?.init?.();
      global.SMTN170SuiReadiness?.init?.();
      return;
    }
    const s = document.createElement("script");
    s.src = urls[i];
    s.onload = () => loadSequentially(urls, i + 1);
    document.body.appendChild(s);
  }

  loadSequentially([...chain, ...extras], 0);
})();
