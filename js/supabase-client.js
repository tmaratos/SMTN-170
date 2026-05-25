/**
 * TN-170 Supabase client — reads window.SUPABASE_CONFIG.url and .anonKey
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
  let readyResolve;
  const readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
  });

  function ensureSdk() {
    if (global.supabase && typeof global.supabase.createClient === "function") {
      return Promise.resolve(global.supabase);
    }
    return Promise.reject(
      new Error("Supabase SDK not loaded. Ensure the Supabase CDN script loads before supabase-client.js.")
    );
  }

  async function init() {
    if (client) {
      readyResolve(client);
      return client;
    }

    const c = cfg();
    if (!c || !c.isConfigured || !c.url || !c.anonKey) {
      initError = new Error(global.TN170SupabaseConfig?.adminMessage?.() || "Supabase is not configured.");
      readyResolve(null);
      return null;
    }

    try {
      const lib = await ensureSdk();
      client = lib.createClient(c.url, c.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: global.localStorage,
        },
        realtime: { params: { eventsPerSecond: 8 } },
      });
      initError = null;
      readyResolve(client);
      return client;
    } catch (err) {
      initError = err;
      console.error("[TN-170] Supabase init failed", err);
      readyResolve(null);
      return null;
    }
  }

  function getClient() {
    return client;
  }

  function getInitError() {
    return initError;
  }

  function whenReady() {
    return readyPromise;
  }

  function onAuthStateChange(cb) {
    return whenReady().then((sb) => {
      if (!sb) return { data: { subscription: { unsubscribe: () => {} } } } };
      return sb.auth.onAuthStateChange(cb);
    });
  }

  function subscribeTable(table, filter, cb) {
    return whenReady().then((sb) => {
      if (!sb) return null;
      const ch = sb.channel("tn170-" + table).on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        cb
      );
      ch.subscribe();
      return ch;
    });
  }

  global.SMTN170Supabase = {
    init,
    getClient,
    getInitError,
    whenReady,
    isConfigured,
    onAuthStateChange,
    subscribeTable,
    storageBucket: () => cfg()?.storageBucket || "squadron-files",
  };

  init();
})(window);
