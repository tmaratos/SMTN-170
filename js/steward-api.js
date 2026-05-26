/**
 * Steward Phase 3 — thin frontend client for stewardCore Cloud Function.
 * Re-exports js/steward-client.js (Firebase httpsCallable).
 */
(function initStewardApi(global) {
  const client = () => global.SMTN170StewardClient || global.SMTN170StewardApi;

  global.SMTN170StewardApi = {
    CAP_SEARCH_MARKER: "CAP_SEARCH_URL:",
    isConfigured: () => client()?.isConfigured?.() ?? false,
    invoke: (body) => client().invoke(body),
    openCapUrl: (url) => client().openCapUrl(url),
    parseCapUrlFromText: (text) => client().parseCapUrlFromText(text),
    stripCapMarker: (text) => client().stripCapMarker(text),
    functionsUrl: () => null,
  };
})(window);
