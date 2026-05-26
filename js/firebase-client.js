/**
 * TN-170 Firebase browser client — modular SDK via CDN dynamic import.
 * Auth + Firestore + Cloud Functions only (V1 — no Storage).
 */
(function initFirebaseClient(global) {
  const FB_VERSION = "10.14.1";
  const BASE = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

  let app = null;
  let auth = null;
  let db = null;
  let functions = null;
  let readyPromise = null;
  let modules = {};

  function config() {
    return global.TN170_FIREBASE_CONFIG || global.SMTN170_FIREBASE_CONFIG || {};
  }

  function isConfigured() {
    const c = config();
    return !!(c.apiKey && c.projectId && c.apiKey !== "YOUR_API_KEY");
  }

  async function loadModules() {
    const [appMod, authMod, firestoreMod, functionsMod] = await Promise.all([
      import(`${BASE}/firebase-app.js`),
      import(`${BASE}/firebase-auth.js`),
      import(`${BASE}/firebase-firestore.js`),
      import(`${BASE}/firebase-functions.js`),
    ]);
    modules = { appMod, authMod, firestoreMod, functionsMod };
    return modules;
  }

  function buildAuthFacade() {
    const { onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } = modules.authMod;

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
        try {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          return { data: { session: await sessionFromUser(cred.user), user: cred.user }, error: null };
        } catch (error) {
          return { data: { session: null }, error };
        }
      },
      signUp: async ({ email, password, options }) => {
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

  function buildClientFacade() {
    const data = global.SMTN170FirebaseData;
    return {
      auth: buildAuthFacade(),
      from: (table) => data.from(table),
      channel: (name) => ({
        on: () => ({ subscribe: () => {} }),
      }),
    };
  }

  async function initFirebase() {
    if (app) return app;
    if (!isConfigured()) {
      console.warn("[TN-170] Firebase config placeholders — paste keys in js/firebase-config.js");
      return null;
    }
    await loadModules();
    const { initializeApp } = modules.appMod;
    const { getAuth } = modules.authMod;
    const { getFirestore } = modules.firestoreMod;
    const { getFunctions, connectFunctionsEmulator } = modules.functionsMod;

    app = initializeApp(config());
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app, config().functionsRegion || "us-central1");

    if (global.location?.hostname === "localhost") {
      try {
        connectFunctionsEmulator(functions, "localhost", 5001);
      } catch {
        /* ignore */
      }
    }

    const facade = buildClientFacade();
    global.TN170FirebaseClient = facade;
    return app;
  }

  async function whenReady() {
    if (!readyPromise) {
      readyPromise = initFirebase().catch((err) => {
        console.error("[TN-170] Firebase init failed", err);
        return null;
      });
    }
    await readyPromise;
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

  const api = {
    whenReady,
    getClient,
    getAuth: getAuthInstance,
    getFirestore,
    getFirestoreModule,
    getFunctions: getFunctionsInstance,
    getFunctionsModule,
    getSession,
    onAuthStateChange,
    subscribeTable,
    isConfigured,
  };

  global.SMTN170Firebase = api;
  global.TN170Firebase = api;
})(window);
