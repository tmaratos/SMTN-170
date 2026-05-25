/**
 * TN-170 Supabase — publishable (anon) key only. Never put service role here.
 */
window.SUPABASE_CONFIG = {
  url: "https://hmfbeqnlcchkjyzqnlni.supabase.co",
  anonKey: "sb_publishable_4xtWm2-5zUTdvKaJBsEPtQ_0rDyyRai",
  storageBucket: "squadron-files",
  isConfigured: true,
};

/** Legacy bridge for modules that read SMTN170_SUPABASE_CONFIG */
window.SMTN170_SUPABASE_CONFIG = {
  SUPABASE_URL: window.SUPABASE_CONFIG.url,
  SUPABASE_ANON_KEY: window.SUPABASE_CONFIG.anonKey,
  STORAGE_BUCKET: window.SUPABASE_CONFIG.storageBucket,
};

window.TN170SupabaseConfig = {
  get() {
    return window.SUPABASE_CONFIG || null;
  },
  isConfigured() {
    return !!(window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.isConfigured);
  },
  adminMessage() {
    return "Supabase is not configured. Please contact the portal administrator.";
  },
};
