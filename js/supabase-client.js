/**
 * @deprecated Supabase removed — use js/firebase-client.js
 * Legacy stub; redirects to SMTN170Firebase when loaded after firebase-client.js.
 */
console.warn("[TN-170] js/supabase-client.js is deprecated. Use js/firebase-client.js instead.");
(function legacySupabaseStub(global) {
  if (global.SMTN170Firebase) {
    global.SMTN170Supabase = global.SMTN170Firebase;
  }
})(window);
