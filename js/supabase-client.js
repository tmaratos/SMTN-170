/**
 * TN-170 Supabase client — auth persistence, session restore, realtime.
 */
(function initSupabaseClient(global) {
  const cfg = () => global.SMTN170_SUPABASE_CONFIG || {};
  let client = null;
  let readyResolve;
  const readyPromise = new Promise((r) => {
    readyResolve = r;
  });

  function isConfigured() {
    const c = cfg();
    return (
      c.SUPABASE_URL &&
      !c.SUPABASE_URL.includes("YOUR_PROJECT") &&
      c.SUPABASE_ANON_KEY &&
      c.SUPABASE_ANON_KEY.length > 10
    );
  }

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
      console.warn("[TN-170] Supabase URL not configured — set SUPABASE_URL in js/supabase-config.js");
      readyResolve(client);
      return null;
    }
    const lib = await loadSdk();
    const c = cfg();
    client = lib.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
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
      let ch = sb.channel("tn170-" + table).on(
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
    storageBucket: () => cfg().STORAGE_BUCKET || "squadron-files",
  };

  init().catch((err) => {
    console.error("[TN-170] Supabase init failed", err);
    readyResolve(null);
  });
})(window);
