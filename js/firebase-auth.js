/**
 * TN-170 Firebase Auth helpers for portal pages.
 */
(function initFirebaseAuthHelpers(global) {
  function formatAuthError(error) {
    if (!error) return "Could not sign in.";
    const code = error.code ? String(error.code) : "";
    const message = error.message ? String(error.message) : String(error);

    if (global.SMTN170Firebase?.isNetworkAuthError?.(error)) {
      return "Firebase Auth could not be reached. Check internet connection, Firebase config, authorized domain, and Email/Password provider.";
    }

    if (code && message) return `${code}: ${message}`;
    if (code) return code;
    return message || "Could not sign in.";
  }

  async function ensureAuthReady() {
    await global.SMTN170Firebase?.whenReady?.({ authOnly: true });
    return global.SMTN170Firebase?.getAuth?.();
  }

  async function getCurrentUser() {
    const auth = await ensureAuthReady();
    return auth?.currentUser || null;
  }

  async function getIdToken() {
    const user = await getCurrentUser();
    if (!user) return null;
    return user.getIdToken();
  }

  async function signIn(email, password) {
    const client = await global.SMTN170Firebase?.whenReady?.({ authOnly: true });
    if (!client) throw new Error("Firebase is not configured. Contact the portal administrator.");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const client = global.SMTN170Firebase?.getClient?.();
    if (client) await client.auth.signOut();
  }

  function mapFirebaseAuthError(error) {
    return formatAuthError(error);
  }

  global.SMTN170FirebaseAuth = {
    ensureAuthReady,
    getCurrentUser,
    getIdToken,
    signIn,
    signOut,
    mapFirebaseAuthError,
    formatAuthError,
  };
})(window);
