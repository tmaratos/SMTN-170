/**
 * @deprecated V1 — upload/import Cloud Functions not used in portal runtime.
 * TN-170 Import Processor — Firebase Cloud Function httpsCallable client.
 */
(function initImportClient(global) {
  async function getCallable() {
    await global.SMTN170Firebase?.whenReady?.();
    const mod = global.SMTN170Firebase?.getFunctionsModule?.();
    const fn = global.SMTN170Firebase?.getFunctions?.();
    if (!mod || !fn) throw new Error("Firebase Functions not ready.");
    return mod.httpsCallable(fn, "importProcessor");
  }

  function isConfigured() {
    return global.SMTN170Firebase?.isConfigured?.() ?? false;
  }

  /**
   * Invoke importProcessor Cloud Function.
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async function invoke(payload) {
    if (!isConfigured()) {
      throw new Error("Sign in with Firebase configured to use Smart Import.");
    }
    const callable = await getCallable();
    const res = await callable(payload || {});
    const data = res.data || {};
    if (data.ok === false) {
      throw new Error(data.error || data.message || "Import processor failed.");
    }
    return data;
  }

  global.SMTN170ImportClient = {
    isConfigured,
    invoke,
  };
})(window);
