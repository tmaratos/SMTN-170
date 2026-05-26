/**
 * TN-170 Firebase browser client — modular SDK (CDN or dynamic import).
 * Initializes Firebase exactly once. Login pages load auth only (no Storage/Functions).
 */
(function initFirebaseClient(global) {
  const FB_VERSION = "10.14.1";
  const BASE = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

  let app = null;
  let auth = null;
  let db = null;
  let functions = null;
  let readyPromise = null;
  let initMode = null;
  let modules = {};

  function config() {
    return global.TN170_FIREBASE_CONFIG || global.SMTN170_FIREBASE_CONFIG || {};
  }

  function isConfigured() {
    const c = config();
    return !!(c.apiKey && c.projectId && c.apiKey !== "YOUR_API_KEY");
  }

  function isLoginPage() {
    const page = (global.location?.pathname || "").split("/").pop() || "";
    return page === "login.html" || page === "" && global.location?.pathname?.endsWith("/");
  }

  function wantsAuthOnly(options) {
    if (options?.authOnly === true) return true;
    if (options?.authOnly === false) return false;
    return isLoginPage() || !global.SMTN170FirebaseData;
  }

  async function waitForPreloadedModules(timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 15000);
    while (Date.now() < deadline) {
      if (global.__TN170_FIREBASE_MODULES__?.appMod && global.__TN170_FIREBASE_MODULES__?.authMod) {
        return global.__TN170_FIREBASE_MODULES__;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    return null;
  }

  async function loadModules(authOnly) {
    const preloaded = await waitForPreloadedModules(5000);
    if (preloaded?.appMod && preloaded?.authMod) {
      modules.appMod = preloaded.appMod;
      modules.authMod = preloaded.authMod;
      if (!authOnly) {
        const [firestoreMod, functionsMod] = await Promise.all([
          import(`${BASE}/firebase-firestore.js`),
          import(`${BASE}/firebase-functions.js`),
        ]);
        modules.firestoreMod = firestoreMod;
        modules.functionsMod = functionsMod;
      }
      return modules;
    }

    if (authOnly) {
      const [appMod, authMod] = await Promise.all([
        import(`${BASE}/firebase-app.js`),
        import(`${BASE}/firebase-auth.js`),
      ]);
      modules = { appMod, authMod };
      return modules;
    }

    const [appMod, authMod, firestoreMod, functionsMod] = await Promise.all([
      import(`${BASE}/firebase-app.js`),
      import(`${BASE}/firebase-auth.js`),
      import(`${BASE}/firebase-firestore.js`),
      import(`${BASE}/firebase-functions.js`),
    ]);
    modules = { appMod, authMod, firestoreMod, functionsMod };
    return modules;
  }

  function isNetworkAuthError(error) {
    if (!error) return false;
    const code = String(error.code || "");
    const message = String(error.message || error);
    return (
      code === "auth/network-request-failed" ||
      message.includes("Failed to fetch") ||
      message.includes("NetworkError") ||
      (error.name === "TypeError" && message.includes("fetch"))
    );
  }

  function buildAuthFacade() {
    const { onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } =
      modules.authMod;

    async function sessionFromUser(user) {
      if (!user) return null;
      const token = await user.getIdToken();
      return {
        user: { id: user.uid, email: user.email || "" },
        access_token: token,
      };
    }

    return {
      getSession: async () => {
        try {
          const session = await sessionFromUser(auth.currentUser);
          return { data: { session }, error: null };
        } catch (error) {
          return { data: { session: null }, error };
        }
      },
      getUser: async () => {
        const user = auth.currentUser;
        if (!user) return { data: { user: null }, error: null };
        return { data: { user: { id: user.uid, email: user.email } }, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        console.log("LOGIN_ATTEMPT_STARTED");
        try {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          console.log("LOGIN_ATTEMPT_SUCCESS");
          return { data: { session: await sessionFromUser(cred.user), user: cred.user }, error: null };
        } catch (error) {
          console.log("LOGIN_ATTEMPT_FAILED", error?.code || "", error?.message || error);
          return { data: { session: null }, error };
        }
      },
      signUp: async ({ email, password }) => {
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          return { data: { user: cred.user, session: await sessionFromUser(cred.user) }, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      signOut: () => signOut(auth),
      onAuthStateChange: (cb) => {
        const unsub = onAuthStateChanged(auth, async (user) => {
          const session = await sessionFromUser(user);
          cb(user ? "SIGNED_IN" : "SIGNED_OUT", session);
        });
        return { data: { subscription: { unsubscribe: unsub } } };
      },
    };
  }

  function buildClientFacade(mode) {
    const data = global.SMTN170FirebaseData;
    const facade = {
      auth: buildAuthFacade(),
      channel: () => ({
        on: () => ({ subscribe: () => {} }),
      }),
    };
    if (mode === "full" && data) {
      facade.from = (table) => data.from(table);
    } else if (mode === "full") {
      facade.from = () => {
        throw new Error("Firestore data layer is not loaded on this page.");
      };
    }
    return facade;
  }

  async function attachFirestore() {
    if (db && initMode === "full") return;
    if (!modules.firestoreMod || !modules.functionsMod) {
      await loadModules(false);
    }
    if (!app || !auth || !modules.firestoreMod || !modules.functionsMod) return;

    const { getFirestore } = modules.firestoreMod;
    const { getFunctions, connectFunctionsEmulator } = modules.functionsMod;
    db = getFirestore(app);
    functions = getFunctions(app, config().functionsRegion || "us-central1");
    if (global.location?.hostname === "localhost") {
      try {
        connectFunctionsEmulator(functions, "localhost", 5001);
      } catch {
        /* ignore */
      }
    }
    initMode = "full";
    global.TN170FirebaseClient = buildClientFacade("full");
    console.log("FIREBASE_FIRESTORE_READY");
  }

  async function upgradeToFullClient() {
    if (initMode === "full" && db) return getClient();
    if (!app || !auth) {
      await initFirebase({ authOnly: false });
      return getClient();
    }
    await attachFirestore();
    return getClient();
  }

  async function initFirebase(options) {
    const authOnly = wantsAuthOnly(options);

    if (app && auth) {
      if (!authOnly && initMode !== "full") {
        await attachFirestore();
      }
      return app;
    }

    if (!isConfigured()) {
      console.warn("[TN-170] Firebase config placeholders — paste keys in js/firebase-config.js");
      return null;
    }

    await loadModules(authOnly);

    const { initializeApp, getApps, getApp } = modules.appMod;
    const { getAuth } = modules.authMod;

    if (getApps().length) {
      app = getApp();
    } else {
      app = initializeApp(config());
      console.log("FIREBASE_APP_INITIALIZED");
    }

    auth = getAuth(app);
    console.log("FIREBASE_AUTH_READY");

    if (!authOnly && modules.firestoreMod && modules.functionsMod) {
      await attachFirestore();
    } else {
      initMode = "auth";
      global.TN170FirebaseClient = buildClientFacade("auth");
    }

    return app;
  }

  async function ensureFullClient() {
    return upgradeToFullClient();
  }

  async function whenReady(options) {
    if (!readyPromise) {
      readyPromise = initFirebase(options).catch((err) => {
        console.error("[TN-170] Firebase init failed", err);
        readyPromise = null;
        return null;
      });
    }
    await readyPromise;
    if (options?.authOnly === false || (!options?.authOnly && global.SMTN170FirebaseData)) {
      await upgradeToFullClient();
    }
    return getClient();
  }

  function getClient() {
    return global.TN170FirebaseClient || null;
  }

  function getAuthInstance() {
    return auth;
  }

  function getFirestore() {
    return db;
  }

  function getFirestoreModule() {
    return modules.firestoreMod;
  }

  function getAuthModule() {
    return modules.authMod;
  }

  function getFunctionsInstance() {
    return functions;
  }

  function getFunctionsModule() {
    return modules.functionsMod;
  }

  async function getSession() {
    const client = await whenReady();
    if (!client) return { data: { session: null }, error: new Error("No Firebase client") };
    return client.auth.getSession();
  }

  function onAuthStateChange(cb) {
    const client = getClient();
    if (!client) return { data: { subscription: { unsubscribe: () => {} } } };
    return client.auth.onAuthStateChange(cb);
  }

  function subscribeTable(table, filter, cb) {
    return global.SMTN170FirebaseData?.subscribeCollection?.(table, filter, cb);
  }

  async function getFunctionsReady() {
    if (!functions) await ensureFullClient();
    return functions;
  }

  async function getFunctionsModuleReady() {
    if (!modules.functionsMod) await ensureFullClient();
    return modules.functionsMod;
  }

  const api = {
    whenReady,
    ensureFullClient,
    getClient,
    getAuth: getAuthInstance,
    getAuthModule,
    getFirestore,
    getFirestoreModule,
    getFunctions: getFunctionsInstance,
    getFunctionsModule,
    getFunctionsReady,
    getFunctionsModuleReady,
    getSession,
    onAuthStateChange,
    subscribeTable,
    isConfigured,
    isNetworkAuthError,
  };

  global.SMTN170Firebase = api;
  global.TN170Firebase = api;
})(window);
