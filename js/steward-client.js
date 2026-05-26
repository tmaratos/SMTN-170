/**
 * TN-170 Steward — Cloudflare Worker client.
 * Public repo: thin wrapper only; brain runs server-side on the worker.
 */
(function initStewardClient(global) {
  const CAP_SEARCH_MARKER = "CAP_SEARCH_URL:";
  const UNAVAILABLE_PREFIX = "Steward is unavailable right now: ";

  function getWorkerUrl() {
    const cfg = global.TN170_FIREBASE_CONFIG || global.SMTN170_FIREBASE_CONFIG || {};
    const url = cfg.stewardWorkerUrl || cfg.steward_worker_url || "";
    return typeof url === "string" ? url.trim().replace(/\/$/, "") : "";
  }

  function formatUnavailable(error) {
    const detail = error?.message ? String(error.message) : "Please try again later.";
    if (detail.startsWith(UNAVAILABLE_PREFIX)) return detail;
    return UNAVAILABLE_PREFIX + detail;
  }

  function isConfigured() {
    return !!(getWorkerUrl() && global.SMTN170Firebase?.isConfigured?.());
  }

  async function ensureAuthToken() {
    await global.SMTN170Firebase?.whenReady?.();
    const auth = global.SMTN170Firebase?.getAuth?.();
    const user = auth?.currentUser;
    if (!user) throw new Error("Sign in required");
    const token = await user.getIdToken();
    return { user, token };
  }

  function normalizePayload(body) {
    const src = body || {};
    const confirmation = src.confirmation;
    const payload = {
      message: src.message,
      pagePath: src.pagePath || src.page_path || global.location?.pathname || "",
      pageTitle: src.pageTitle || src.page_title || (typeof document !== "undefined" ? document.title : ""),
    };
    const pendingActionId = src.pendingActionId || src.pending_action_id;
    if (pendingActionId) payload.pendingActionId = pendingActionId;
    if (confirmation === true || confirmation === false) payload.confirmation = confirmation;
    return payload;
  }

  async function invoke(body) {
    try {
      const workerUrl = getWorkerUrl();
      if (!workerUrl) {
        throw new Error("Steward worker URL is not configured");
      }
      if (!isConfigured()) {
        throw new Error("Firebase is not configured");
      }

      const { token } = await ensureAuthToken();
      const payload = normalizePayload(body);
      if (!payload.message && payload.confirmation == null) {
        throw new Error("Message or confirmation required");
      }

      const res = await fetch(`${workerUrl}/steward`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || `HTTP ${res.status}`);
      }
      if (data.ok === false) {
        throw new Error(data.error || data.message || "Request failed");
      }
      return data;
    } catch (err) {
      throw new Error(formatUnavailable(err));
    }
  }

  function openCapUrl(url) {
    if (!url) return;
    global.open(url, "_blank", "noopener,noreferrer");
  }

  function parseCapUrlFromText(text) {
    const m = (text || "").match(/CAP_SEARCH_URL:(https?:\/\/[^\s]+)/);
    return m ? m[1] : null;
  }

  function stripCapMarker(text) {
    return (text || "").replace(/\n*CAP_SEARCH_URL:https?:\/\/[^\s]+/g, "").trim();
  }

  global.SMTN170StewardClient = {
    CAP_SEARCH_MARKER,
    getWorkerUrl,
    isConfigured,
    invoke,
    openCapUrl,
    parseCapUrlFromText,
    stripCapMarker,
  };
})(window);
