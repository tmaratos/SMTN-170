/**
 * TN-170 Steward — Cloudflare Worker client.
 * Public repo: thin wrapper only; brain runs server-side on the worker.
 */
(function initStewardClient(global) {
  const CAP_SEARCH_MARKER = "CAP_SEARCH_URL:";
  const UNAVAILABLE_PREFIX = "Steward is unavailable right now";

  function getWorkerUrl() {
    const cfg = global.TN170_FIREBASE_CONFIG || global.SMTN170_FIREBASE_CONFIG || {};
    const url = cfg.stewardWorkerUrl || cfg.steward_worker_url || "";
    return typeof url === "string" ? url.trim().replace(/\/$/, "") : "";
  }

  function formatUnavailable(error) {
    const detail = error?.message ? String(error.message) : "";
    if (detail === "Please sign in to use Steward.") return detail;
    if (detail === "Steward could not verify your session. Please sign out and sign back in.") return detail;
    if (/could not connect/i.test(detail)) return detail;
    if (/session could not be verified/i.test(detail)) return detail;
    if (!detail) return UNAVAILABLE_PREFIX + ".";
    if (detail.startsWith(UNAVAILABLE_PREFIX)) return detail;
    return `${UNAVAILABLE_PREFIX}: ${detail}`;
  }

  function isConfigured() {
    return !!(getWorkerUrl() && global.SMTN170Firebase?.isConfigured?.());
  }

  async function ensureAuthToken() {
    await global.SMTN170Firebase?.whenReady?.();
    const auth = global.SMTN170Firebase?.getAuth?.();
    const user = auth?.currentUser;
    if (!user) throw new Error("Please sign in to use Steward.");
    let token = "";
    try {
      token = await user.getIdToken();
    } catch {
      throw new Error("Steward could not verify your session. Please sign out and sign back in.");
    }
    if (!token) {
      throw new Error("Steward could not verify your session. Please sign out and sign back in.");
    }
    return { user, token };
  }

  function buildSiteIndexSummary(message) {
    const api = global.StewardSiteIndex;
    if (!api?.buildSummaryForWorker) return null;
    try {
      return api.buildSummaryForWorker(message);
    } catch {
      return null;
    }
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
    const summary =
      src.siteIndexSummary ||
      src.site_index_summary ||
      (src.message ? buildSiteIndexSummary(src.message) : null);
    if (summary) payload.siteIndexSummary = summary;
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

      await global.StewardSiteIndex?.build?.().catch(() => {});
      const { token } = await ensureAuthToken();
      const payload = normalizePayload(body);
      if (!payload.message && payload.confirmation == null) {
        throw new Error("Message or confirmation required");
      }

      let res;
      try {
        res = await fetch(`${workerUrl}/steward`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } catch {
        throw new Error("Steward could not connect. Check your connection and try again.");
      }

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (res.status === 401 || res.status === 403) {
        throw new Error("Your session could not be verified for Steward. Please sign out and sign back in.");
      }
      if (!res.ok) {
        const safeDetail = data.error || data.message || "";
        throw new Error(safeDetail ? `Steward is unavailable right now: ${safeDetail}` : "Steward is unavailable right now.");
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
