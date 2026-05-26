/**
 * TN-170 Steward — Firebase Cloud Function stewardCore httpsCallable client.
 * Public repo: thin wrapper only; brain runs server-side.
 */
(function initStewardClient(global) {
  const CAP_SEARCH_MARKER = "CAP_SEARCH_URL:";
  const UNAVAILABLE = "Steward is unavailable right now. Please try again later.";

  function isConfigured() {
    return global.SMTN170Firebase?.isConfigured?.() ?? false;
  }

  async function getCallable() {
    await global.SMTN170Firebase?.whenReady?.();
    const mod = global.SMTN170Firebase?.getFunctionsModule?.();
    const fn = global.SMTN170Firebase?.getFunctions?.();
    if (!mod || !fn) throw new Error(UNAVAILABLE);
    return mod.httpsCallable(fn, "stewardCore");
  }

  function normalizePayload(body) {
    const src = body || {};
    const confirmation = src.confirmation;
    return {
      message: src.message,
      pagePath: src.pagePath || src.page_path || global.location?.pathname || "",
      pageTitle: src.pageTitle || src.page_title || (typeof document !== "undefined" ? document.title : ""),
      conversationId: src.conversationId || src.conversation_id,
      pendingActionId: src.pendingActionId || src.pending_action_id,
      confirmation: confirmation === true || confirmation === false ? confirmation : undefined,
      activeMode: src.activeMode || src.active_mode,
      // Legacy confirm/cancel flags for deployed function versions
      confirm_pending: confirmation === true,
      cancel_pending: confirmation === false,
    };
  }

  async function invoke(body) {
    if (!isConfigured()) {
      throw new Error(UNAVAILABLE);
    }
    const callable = await getCallable();
    const payload = normalizePayload(body);
    if (!payload.message && payload.confirmation == null && !payload.confirm_pending && !payload.cancel_pending) {
      throw new Error(UNAVAILABLE);
    }
    const res = await callable(payload);
    const data = res.data || {};
    if (data.ok === false) {
      throw new Error(data.error || data.message || UNAVAILABLE);
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

  /** Legacy alias */
  global.SMTN170StewardApi = global.SMTN170StewardClient;
})(window);
