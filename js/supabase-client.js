/**
 * TN-170 Supabase client — auth persistence, session restore, realtime.
 */
(function initSupabaseClient(global) {
  function readCfg() {
    const c = global.SUPABASE_CONFIG;
    if (c && c.url) {
      return {
        url: c.url,
        anonKey: c.anonKey,
        storageBucket: c.storageBucket || "squadron-files",
      };
    }
    const legacy = global.SMTN170_SUPABASE_CONFIG || {};
    return {
      url: legacy.SUPABASE_URL,
      anonKey: legacy.SUPABASE_ANON_KEY,
      storageBucket: legacy.STORAGE_BUCKET || "squadron-files",
    };
  }

  function isConfigured() {
    if (global.TN170SupabaseConfig?.isConfigured) {
      return global.TN170SupabaseConfig.isConfigured();
    }
    const c = readCfg();
    return !!(
      c.url &&
      c.anonKey &&
      c.anonKey.length > 10 &&
      !String(c.url).includes("YOUR_PROJECT")
    );
  }

  let client = null;
  let readyResolve;
  const readyPromise = new Promise((r) => {
    readyResolve = r;
  });

  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (global.supabase?.createClient) {
        resolve(global.supabase);
        return;
      }
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js";
      s.async = true;
      s.onload = () => resolve(global.supabase);
      s.onerror = () => reject(new Error("Could not load Supabase SDK"));
      document.head.appendChild(s);
    });
  }

  async function init() {
    if (client) return client;
    if (!isConfigured()) {
      console.warn("[TN-170] Supabase is not configured.");
      readyResolve(null);
      return null;
    }
    try {
      const lib = await loadSdk();
      const c = readCfg();
      client = lib.createClient(c.url, c.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: global.localStorage,
        },
        realtime: { params: { eventsPerSecond: 8 } },
      });
      readyResolve(client);
      return client;
    } catch (err) {
      console.error("[TN-170] Supabase init failed", err);
      readyResolve(null);
      return null;
    }
  }

  function getClient() {
    return client;
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
    whenReady,
    isConfigured,
    onAuthStateChange,
    subscribeTable,
    storageBucket: () => readCfg().storageBucket || "squadron-files",
  };

  init();
})(window);
