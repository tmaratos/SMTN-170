/**
 * TN-170 Steward — Firebase Cloud Function stewardCore httpsCallable client.
 * Public repo: thin wrapper only; brain runs server-side.
 */
(function initStewardClient(global) {
  const CAP_SEARCH_MARKER = "CAP_SEARCH_URL:";
  const UNAVAILABLE_PREFIX = "Steward is unavailable right now: ";

  function formatUnavailable(error) {
    const detail = error?.message ? String(error.message) : "Please try again later.";
    if (detail.startsWith(UNAVAILABLE_PREFIX)) return detail;
    return UNAVAILABLE_PREFIX + detail;
  }

  function isConfigured() {
    return global.SMTN170Firebase?.isConfigured?.() ?? false;
  }

  async function ensureAuthToken() {
    await global.SMTN170Firebase?.ensureFullClient?.();
    const auth = global.SMTN170Firebase?.getAuth?.();
    const user = auth?.currentUser;
    if (!user) throw new Error("Sign in required");
    await user.getIdToken();
    return user;
  }

  async function getCallable() {
    await global.SMTN170Firebase?.ensureFullClient?.();
    const mod = global.SMTN170Firebase?.getFunctionsModule?.();
    const fn = global.SMTN170Firebase?.getFunctions?.();
    if (!mod || !fn) throw new Error("Firebase Functions is not available");
    return mod.httpsCallable(fn, "stewardCore");
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
      if (!isConfigured()) {
        throw new Error("Firebase is not configured");
      }
      await ensureAuthToken();
      const callable = await getCallable();
      const payload = normalizePayload(body);
      if (!payload.message && payload.confirmation == null) {
        throw new Error("Message or confirmation required");
      }
      const res = await callable(payload);
      const data = res.data || {};
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
    isConfigured,
    invoke,
    openCapUrl,
    parseCapUrlFromText,
    stripCapMarker,
  };
})(window);
