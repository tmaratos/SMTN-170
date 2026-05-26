/**
 * @deprecated Supabase removed — use js/firebase-config.js
 * TN-170 Supabase constants (legacy stub).
 */
console.warn("[TN-170] js/supabase-config.js is deprecated. Use js/firebase-config.js instead.");
window.SUPABASE_CONFIG = window.FIREBASE_CONFIG || {
  url: null,
  anonKey: null,
  storageBucket: "squadron-files",
  isConfigured: false,
};
window.SMTN170_SUPABASE_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  STORAGE_BUCKET: "squadron-files",
};
