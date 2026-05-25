/**
 * Steward Phase 3 — thin frontend client for steward-core Edge Function.
 * No operational logic here; UI shell only.
 */
(function initStewardApi(global) {
  const CAP_SEARCH_MARKER = "CAP_SEARCH_URL:";

  function config() {
    const c = global.SUPABASE_CONFIG;
    if (c?.url) {
      return { SUPABASE_URL: c.url, SUPABASE_ANON_KEY: c.anonKey };
    }
    return global.SMTN170_SUPABASE_CONFIG || {};
  }

  function isConfigured() {
    return global.TN170SupabaseConfig?.isConfigured?.() || global.SMTN170Supabase?.isConfigured?.() || false;
  }

  async function getAccessToken() {
    const sb = global.SMTN170Supabase?.getClient?.();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.access_token || null;
  }

  function functionsUrl() {
    const base = (config().SUPABASE_URL || "").replace(/\/$/, "");
    if (!base || base.includes("YOUR_PROJECT")) return null;
    return `${base}/functions/v1/steward-core`;
  }

  /**
   * Invoke Steward Core Edge Function.
   * @param {object} body
   * @returns {Promise<object>}
   */
  async function invoke(body) {
    const url = functionsUrl();
    const token = await getAccessToken();
    const anon = config().SUPABASE_ANON_KEY;

    if (!url || !token || !anon) {
      throw new Error("Sign in with Supabase configured to use Steward.");
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Steward unavailable (${res.status})`);
    }
    return data;
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

  global.SMTN170StewardApi = {
    CAP_SEARCH_MARKER,
    isConfigured,
    invoke,
    openCapUrl,
    parseCapUrlFromText,
    stripCapMarker,
    functionsUrl,
  };
})(window);
