/**
 * Portal bootstrap — sync profile after auth-guard session check (no page redirects).
 */
(function initPortalBootstrap(global) {
  async function bootstrap() {
    const page = document.body?.dataset?.portalPage || "";
    const authOk =
      page === "admin"
        ? await global.TN170AuthGuard?.runAdminPage?.()
        : global.TN170_PAGE_AUTH_HANDLED || (await global.TN170AuthGuard?.ensureProtectedSession?.());

    if (authOk) {
      try {
        await global.SMTN170Auth?.init?.();
        console.log("PROFILE_LOAD_OK");
      } catch (e) {
        console.log("PROFILE_LOAD_ERROR", e?.message || e);
      }
      global.TN170AuthGuard?.hideLoading?.();
      global.dispatchEvent(new CustomEvent("smtn170:auth-ready", { detail: { session: global.SMTN170Auth?.loadSession?.() } }));
      if (document.getElementById("dashboardV2")) {
        global.SMTN170Shell?.renderDashboardV2?.().catch((err) => console.warn("[TN-170] dashboard", err));
      }
      global.SMTN170PortalNav?.init?.();
      global.SMTN170Steward?.rebind?.();
      global.SMTN170Pages?.bindStewardContextActions?.();
      if (page === "admin") {
        global.SMTN170PortalAdmin?.render?.();
      }
    }
  }

  function start() {
    bootstrap();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  global.SMTN170Bootstrap = { bootstrap };
})(window);
