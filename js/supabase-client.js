/**
 * TN-170 Supabase client — window.TN170_SUPABASE + SMTN170Supabase (protected pages).
 */
(function initSupabaseClient(global) {
  function cfg() {
    return global.SUPABASE_CONFIG || null;
  }

  function isConfigured() {
    const c = cfg();
    return !!(c && c.isConfigured && c.url && c.anonKey);
  }

  let client = null;
  let initError = null;

  function buildClient() {
    if (client) return client;

    const c = cfg();
    if (!c || !c.isConfigured || !c.url || !c.anonKey) {
      initError = new Error(
        global.TN170SupabaseConfig?.adminMessage?.() || "Supabase is not configured."
      );
      return null;
    }

    if (!global.supabase || typeof global.supabase.createClient !== "function") {
      initError = new Error(
        "Supabase SDK not loaded. Ensure the Supabase CDN script loads before supabase-client.js."
      );
      return null;
    }

    try {
      client = global.supabase.createClient(c.url, c.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: global.localStorage,
        },
        realtime: { params: { eventsPerSecond: 8 } },
      });
      initError = null;
    } catch (err) {
      initError = err;
      console.error("[TN-170] Supabase init failed", err);
      client = null;
    }

    return client;
  }

  buildClient();

  function getClient() {
    return client || buildClient();
  }

  function getInitError() {
    return initError;
  }

  function whenReady() {
    return Promise.resolve(getClient());
  }

  function onAuthStateChange(cb) {
    const sb = getClient();
    if (!sb) return { data: { subscription: { unsubscribe: () => {} } } } };
    return sb.auth.onAuthStateChange(cb);
  }

  function subscribeTable(table, filter, cb) {
    const sb = getClient();
    if (!sb) return null;
    const ch = sb.channel("tn170-" + table).on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter },
      cb
    );
    ch.subscribe();
    return ch;
  }

  const api = {
    get client() {
      return getClient();
    },
    isConfigured,
    getInitError,
  };

  global.TN170_SUPABASE = api;

  global.SMTN170Supabase = {
    init: async () => getClient(),
    getClient,
    getInitError,
    whenReady,
    isConfigured,
    onAuthStateChange,
    subscribeTable,
    storageBucket: () => cfg()?.storageBucket || "squadron-files",
  };
})(window);
