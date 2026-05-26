/**
 * TN-170 Firebase browser client — modular SDK via CDN dynamic import.
 * Provides Supabase-compatible facade on SMTN170Firebase.getClient() for portal modules.
 */
(function initFirebaseClient(global) {
  const FB_VERSION = "10.14.1";
  const BASE = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

  let app = null;
  let auth = null;
  let db = null;
  let storage = null;
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
    const [
      appMod,
      authMod,
      firestoreMod,
      storageMod,
      functionsMod,
    ] = await Promise.all([
      import(`${BASE}/firebase-app.js`),
      import(`${BASE}/firebase-auth.js`),
      import(`${BASE}/firebase-firestore.js`),
      import(`${BASE}/firebase-storage.js`),
      import(`${BASE}/firebase-functions.js`),
    ]);
    modules = { appMod, authMod, firestoreMod, storageMod, functionsMod };
    return modules;
  }

  function buildStorageFacade(bucketName) {
    const { ref, uploadBytes, deleteObject, getDownloadURL } = modules.storageMod;
    const root = ref(storage, bucketName || config().storageBucket);
    return {
      upload: async (path, file, opts) => {
        try {
          const fileRef = ref(root, path);
          const snap = await uploadBytes(fileRef, file, opts?.cacheControl ? { customMetadata: { cacheControl: opts.cacheControl } } : undefined);
          return { data: { path: snap.ref.fullPath }, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      remove: async (paths) => {
        try {
          await Promise.all((paths || []).map((p) => deleteObject(ref(root, p))));
          return { data: null, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      getPublicUrl: (path) => {
        const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(config().storageBucket)}/o/${encodeURIComponent(path)}?alt=media`;
        return { data: { publicUrl: url } };
      },
      createSignedUrl: async (path) => {
        try {
          const url = await getDownloadURL(ref(root, path));
          return { data: { signedUrl: url }, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
    };
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
      storage: {
        from: (bucket) => buildStorageFacade(bucket),
      },
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
    const { getStorage } = modules.storageMod;
    const { getFunctions, connectFunctionsEmulator } = modules.functionsMod;

    app = initializeApp(config());
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
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

  function getStorageInstance() {
    return storage;
  }

  function getFunctionsInstance() {
    return functions;
  }

  function getFunctionsModule() {
    return modules.functionsMod;
  }

  function storageBucket() {
    return config().storageBucket || "squadron-files";
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
    getStorage: getStorageInstance,
    getFunctions: getFunctionsInstance,
    getFunctionsModule,
    getSession,
    onAuthStateChange,
    subscribeTable,
    storageBucket,
    isConfigured,
  };

  global.SMTN170Firebase = api;
  global.TN170Firebase = api;

  /** Legacy aliases — deprecated; use SMTN170Firebase */
  global.SMTN170Supabase = api;
  global.TN170SupabaseClient = null;
  Object.defineProperty(global, "TN170SupabaseClient", {
    configurable: true,
    get() {
      return getClient();
    },
  });

  global.SUPABASE_CONFIG = {
    url: null,
    anonKey: null,
    storageBucket: storageBucket(),
    isConfigured: isConfigured(),
  };

  global.SMTN170_SUPABASE_CONFIG = {
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
    STORAGE_BUCKET: storageBucket(),
  };
})(window);
