/**
 * Supabase connection — browser-safe anon key only (RLS protects data).
 */
(function initSupabaseConfig(global) {
  const url = "https://hmfbeqnlcchkjyzqnlni.supabase.co";
  const anonKey = "sb_publishable_4xtWm2-5zUTdvKaJBsEPtQ_0rDyyRai";
  const storageBucket = "squadron-files";

  const isConfigured = !!(
    url &&
    anonKey &&
    anonKey.length > 10 &&
    !String(url).includes("YOUR_PROJECT")
  );

  global.SUPABASE_CONFIG = {
    url,
    anonKey,
    storageBucket,
    isConfigured,
  };

  /** Legacy shape used by existing portal modules */
  global.SMTN170_SUPABASE_CONFIG = {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anonKey,
    STORAGE_BUCKET: storageBucket,
  };

  global.TN170SupabaseConfig = {
    get() {
      return global.SUPABASE_CONFIG || null;
    },
    isConfigured() {
      const cfg = global.SUPABASE_CONFIG;
      if (cfg && typeof cfg.isConfigured === "boolean") return cfg.isConfigured;
      return false;
    },
    adminMessage() {
      return "Supabase is not configured. Please contact the portal administrator.";
    },
  };
})(window);
