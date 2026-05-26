/**
 * TN-170 Steward — Firebase Cloud Function stewardCore httpsCallable client.
 */
(function initStewardClient(global) {
  const CAP_SEARCH_MARKER = "CAP_SEARCH_URL:";

  function isConfigured() {
    return global.SMTN170Firebase?.isConfigured?.() ?? false;
  }

  async function getCallable() {
    await global.SMTN170Firebase?.whenReady?.();
    const mod = global.SMTN170Firebase?.getFunctionsModule?.();
    const fn = global.SMTN170Firebase?.getFunctions?.();
    if (!mod || !fn) throw new Error("Firebase Functions not ready.");
    return mod.httpsCallable(fn, "stewardCore");
  }

  async function invoke(body) {
    if (!isConfigured()) {
      throw new Error("Sign in with Firebase configured to use Steward.");
    }
    const callable = await getCallable();
    const res = await callable(body || {});
    const data = res.data || {};
    if (data.ok === false) {
      throw new Error(data.error || data.message || "Steward unavailable.");
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

  /** Global launcher used by steward-launcher and portal pages */
  async function openSteward(promptText) {
    if (global.SMTN170Steward?.openWithPrompt) {
      await global.SMTN170Steward.openWithPrompt(promptText);
      return;
    }
    if (global.SMTN170Steward?.open) {
      global.SMTN170Steward.open();
      if (promptText && global.SMTN170Steward?.sendMessage) {
        await global.SMTN170Steward.sendMessage(promptText);
      }
      return;
    }
    global.location.href = "dashboard.html#steward";
  }

  global.SMTN170StewardClient = {
    CAP_SEARCH_MARKER,
    isConfigured,
    invoke,
    openCapUrl,
    parseCapUrlFromText,
    stripCapMarker,
    openSteward,
  };

  global.openSteward = openSteward;

  /** Legacy alias */
  global.SMTN170StewardApi = global.SMTN170StewardClient;
})(window);
