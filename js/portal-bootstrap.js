/**
 * Portal bootstrap — sync profile after auth-guard session check (no page redirects).
 */
(function initPortalBootstrap(global) {
  let booted = false;

  async function bootstrap() {
    if (booted) return;
    const page = document.body?.dataset?.portalPage || "";
    const authOk =
      page === "admin"
        ? await global.TN170AuthGuard?.runAdminPage?.()
        : global.TN170_PAGE_AUTH_HANDLED || (await global.TN170AuthGuard?.ensureProtectedSession?.());

    if (!authOk) return;
    booted = true;

    try {
      await global.SMTN170Auth?.init?.({ skipEvent: true });
      console.log("PROFILE_LOAD_OK");
    } catch (e) {
      console.log("PROFILE_LOAD_ERROR", e?.message || e);
    }

    global.TN170AuthGuard?.hideLoading?.();
    global.SMTN170Shell?.initShellChrome?.();
    global.SMTN170PortalNav?.init?.();
    global.SMTN170StewardLauncher?.rebind?.();
    global.SMTN170Pages?.init?.();
    global.SMTN170Pages?.bindStewardContextActions?.();

    if (document.getElementById("dashboardV2")) {
      global.SMTN170Shell?.renderDashboardV2?.().catch((err) => console.warn("[TN-170] dashboard", err));
    }

    if (page === "admin") {
      global.SMTN170PortalAdmin?.render?.();
    }

    global.dispatchEvent(new CustomEvent("smtn170:auth-ready", { detail: { session: global.SMTN170Auth?.loadSession?.() } }));
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
