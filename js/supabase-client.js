/**
 * TN-170 — single Supabase browser client (same URL/key/options as login.html).
 */
(function initSupabaseClient(global) {
  const SUPABASE_URL = "https://hmfbeqnlcchkjyzqnlni.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_4xtWm2-5zUTdvKaJBsEPtQ_0rDyyRai";

  const AUTH_OPTIONS = {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: global.localStorage,
    },
  };

  let client = null;
  let readyPromise = null;

  function ensureSdk() {
    if (global.supabase && typeof global.supabase.createClient === "function") {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Supabase SDK failed to load"));
      document.head.appendChild(s);
    });
  }

  function buildClient() {
    if (client) return client;
    if (global.TN170SupabaseClient) {
      client = global.TN170SupabaseClient;
      return client;
    }
    if (!global.supabase || typeof global.supabase.createClient !== "function") {
      return null;
    }
    client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_OPTIONS);
    global.TN170SupabaseClient = client;
    return client;
  }

  function getClient() {
    return client || buildClient();
  }

  async function whenReady() {
    if (!readyPromise) {
      readyPromise = ensureSdk()
        .then(() => buildClient())
        .catch((err) => {
          console.error("[TN-170] Supabase client init failed", err);
          return null;
        });
    }
    await readyPromise;
    return getClient();
  }

  async function getSession() {
    const sb = await whenReady();
    if (!sb) return { data: { session: null }, error: new Error("No Supabase client") };
    return sb.auth.getSession();
  }

  function onAuthStateChange(cb) {
    const sb = getClient();
    if (!sb) return { data: { subscription: { unsubscribe: () => {} } } };
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

  global.SUPABASE_CONFIG = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    storageBucket: "squadron-files",
    isConfigured: true,
  };

  global.SMTN170_SUPABASE_CONFIG = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    STORAGE_BUCKET: "squadron-files",
  };

  global.SMTN170Supabase = {
    getClient,
    whenReady,
    getSession,
    onAuthStateChange,
    subscribeTable,
    storageBucket: () => "squadron-files",
    isConfigured: () => !!(SUPABASE_URL && SUPABASE_ANON_KEY),
  };

  global.TN170_SUPABASE = {
    get client() {
      return getClient();
    },
    isConfigured: () => !!(SUPABASE_URL && SUPABASE_ANON_KEY),
    getInitError: () => null,
  };

  if (global.supabase?.createClient) {
    buildClient();
  }
})(window);
