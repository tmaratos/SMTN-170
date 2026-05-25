/**
 * Standard script chain for protected portal pages.
 * Include once before </body>: <script src="./js/portal-scripts.js?v=1" data-page="dashboard"></script>
 */
(function loadPortalScripts() {
  const PAGE_SCRIPTS = {
    schedule: ["./js/portal-data.js", "./js/schedule-builder.js"],
    documents: ["./js/file-library.js"],
    orgchart: ["./js/portal-pages.js", "./js/org-chart.js"],
    "flight-review": ["./flight-review.js"],
    "sui-readiness": ["./sui-readiness.js"],
    admin: ["./js/portal-data.js", "./js/portal-admin.js"],
    profile: ["./js/portal-data.js", "./js/profile-page.js"],
    tasks: ["./js/tasks-page.js"],
    dashboard: ["./js/portal-data.js", "./js/portal-dashboard.js"],
    calendar: ["./flight-review.js"],
    resources: [],
    exports: ["./flight-review.js"],
    "sui-readiness": ["./sui-readiness.js"],
  };

  const chain = [
    "./portal-config.js?v=3",
    "./js/supabase-config.js?v=1",
    "./js/supabase-client.js?v=1",
    "./js/profile-service.js?v=1",
    "./js/portal-auth.js?v=4",
    "./js/auth-session.js?v=1",
    "./portal-nav.js?v=11",
    "./js/portal-shell.js?v=5",
    "./js/portal-pages.js?v=3",
    "./js/steward-api.js?v=1",
    "./js/steward.js?v=9",
    "./app.js?v=2",
    "./js/profile-banner.js?v=1",
    "./js/portal-bootstrap.js?v=1",
  ];

  const page = document.currentScript?.dataset?.page || document.body?.dataset?.portalPage || "";
  const extras = PAGE_SCRIPTS[page] || [];

  function loadSequentially(urls, i) {
    if (i >= urls.length) {
      global.SMTN170ScheduleBuilder?.init?.();
      global.SMTN170FileLibrary?.init?.();
      global.SMTN170OrgChart?.init?.();
      global.SMTN170TasksPage?.init?.();
      return;
    }
    const s = document.createElement("script");
    s.src = urls[i];
    s.onload = () => loadSequentially(urls, i + 1);
    document.body.appendChild(s);
  }

  loadSequentially([...chain, ...extras], 0);
})();
