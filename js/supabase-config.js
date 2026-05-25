/**
 * Supabase connection — set your project URL before deploy.
 * Anon key is safe for browser use (RLS protects data).
 * For GitHub Pages: edit this file or inject via build step.
 */
(function initSupabaseConfig(global) {
  global.SMTN170_SUPABASE_CONFIG = {
    /** Replace with your project URL from Supabase Dashboard → Settings → API */
    SUPABASE_URL: "https://hmfbeqnlcchkjyzqnlni.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_4xtWm2-5zUTdvKaJBsEPtQ_0rDyyRai",
    STORAGE_BUCKET: "squadron-files",
  };
})(window);
